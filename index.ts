import * as axiosDefault from 'axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import * as qs from 'qs';

/**
 * Just an alias.
 */
const axios = axiosDefault.default;

/**
 * Default configuration.
 */
const defaultConfig = {
    rootUrl: `https://api.kraken.com`,
    timeout: 15000,
    version: 0,
};

/**
 * Default HTTP agent configuration.
 */
const defaultAgentConfig = {
    baseURL: defaultConfig.rootUrl,
    headers: {
        'User-Agent': `Kraken API Client (kraken-cryptoexchange-api node package)`,
    },
    method : 'GET',
    timeout: defaultConfig.timeout,
};

/**
 * The public agent is essentially an alias for the default configuration.
 *
 * @type {{}}
 */
const publicAgentConfig = {
    ...defaultAgentConfig,
};

/**
 * The private agent begins life the same as the public agent, but with 'POST' specified.
 *
 * @type {{method: string}}
 */
const privateAgentConfig = {
    ...defaultAgentConfig,
    method: 'POST',
};

/**
 * The post body shape.
 *
 * Nonce and the optional otp parameter are the only knowns.  Other parameters may be passed depending on the
 * endpoint being called.  This accounts for declaration of string keys with string or number values.
 */
export interface IPostBody {
    [key: string]: string | number;

    nonce: number;
    otp?: string;
}

/**
 * This function is exported so that a user can experiment with/understand how Kraken wants requests to be signed.
 * Essentially, for user edification ;).
 *
 * @param {string} path
 * @param {IPostBody} postBody
 * @param {string} privateKey
 * @returns {string}
 */
export const signMessage = (path: string, postBody: IPostBody, privateKey: string): string => {
    const message      = qs.stringify(postBody);
    const decryptedKey = new Buffer(privateKey, 'base64');

    // Hash the post data
    const hashDigest = crypto.createHash('sha256')
                             .update(postBody.nonce + message)
                             .digest('latin1');

    // Return the HMAC digest
    return crypto.createHmac('sha512', decryptedKey)
                 .update(path + hashDigest, 'latin1')
                 .digest('base64');
};

/**
 * Generates a new nonce.
 *
 * @returns {number}
 */
//tslint:disable:no-magic-numbers
export const generateNonce = (): number => Date.now() * 1000;

//tslint:enable:no-magic-numbers

/**
 * Convenient container for API keys.
 */
export interface IApiAuth {
    publicKey: string;
    privateKey: string;
}

/**
 * The shape of a raw agent.
 */
export interface IRawAgent {
    auth?: IApiAuth;

    isUpgraded(): boolean;

    getPublicEndpoint(endpoint: string,
                      queryParams?: {},
                      configOverride?: IKrakenRequestConfig): Promise<IKrakenResponse>;

    postToPrivateEndpoint(endpoint: string,
                          data: IPostBody,
                          configOverride?: IKrakenRequestConfig): Promise<IKrakenResponse>;

    signMessage(path: string, postBody: IPostBody, privateKey: string): string;

    upgrade(newAuth: IApiAuth): void;
}

const getRawAgent = (auth?: IApiAuth): IRawAgent => ({

    /**
     * This holds the user's API keys.
     */
    auth,

    /**
     * Fetches data from the public (unauthenticated) endpoints.
     *
     * @param {string} endpoint
     * @param {{}} queryParams
     * @param {{}} configOverride
     * @returns {Promise<IKrakenResponse>}
     */
    async getPublicEndpoint(endpoint: string,
                            queryParams?: {},
                            configOverride?: IKrakenRequestConfig): Promise<IKrakenResponse> {

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        // The uri is a relative path to the publicAgentConfig,baseUrl
        const uri = `/${config.version}/public/${endpoint}?${qs.stringify(queryParams)}`;

        // Construct the actual config to be used
        const agentConfig = { ...publicAgentConfig, url: uri };

        // Finally, send the request and return the response
        return Promise.resolve(await axios(agentConfig));
    },

    /**
     * Checks if the user has supplied API keys.
     *
     * @returns {boolean}
     */
    isUpgraded(): boolean { return this.auth; },

    /**
     * Posts to the private (authenticated) endpoints.  If no API keys have been provided, this function will fail.
     *
     * @param {string} endpoint
     * @param {IPostBody} data
     * @param {IKrakenRequestConfig} configOverride
     * @returns {Promise<IKrakenResponse>}
     */
    async postToPrivateEndpoint(endpoint: string,
                                data: IPostBody,
                                configOverride?: IKrakenRequestConfig): Promise<IKrakenResponse> {

        // Ensure the user has credentials
        if (!this.isUpgraded()) return Promise.reject(`api keys are required to access private endpoints`);

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        // The uri is a relative path to the privateAgentConfig,baseUrl
        const uri = `/${config.version}/private/${endpoint}`;

        // Add the appropriate POST request headers (API-Key and API-Sign)
        const headers = {
            ...privateAgentConfig.headers,
            'API-Key' : this.auth.publicKey,
            'API-Sign': this.signMessage(uri, data, this.auth.privateKey),
        };

        // Construct the actual config to be used
        const agentConfig = { ...privateAgentConfig, headers, url: uri, data: qs.stringify(data) };

        // Finally, send the request and return the response
        return Promise.resolve(await axios(agentConfig));
    },

    /**
     * Include the exported #signMessage function for convenience.
     */
    signMessage,

    /**
     * Upgrades a client with new credentials.
     *
     * @param {IApiAuth} newAuth
     */
    upgrade(newAuth: IApiAuth): void { this.auth = newAuth; },
});

// public market data

export type IAssetsParams = { info?: string, aclass?: string, asset?: string };
export type IAssetPairsParams = { info?: string, pair?: string };
export type ITickerParams = { pair: string };
export type IOhlcParams = { pair: string, interval?: number, since?: number };
export type IDepthParams = { pair: string, count?: number };
export type ITradesParams = { pair: string, since?: number };
export type ISpreadParams = { pair: string, since?: number };

// private user data

export type ITradeBalanceParams = { aclass?: string, asset?: string };
export type IOpenOrdersParams = { trades?: boolean, userref?: string };
export type IClosedOrdersParams =
    { trades?: boolean, userref?: string, start?: string, end?: string, ofs?: number, closetime?: string };
export type IOrdersInfoParams = { trades?: true, userref?: string, txid: string; };
export type ITradesHistoryParams = { type?: string, trades?: boolean, start?: string, end?: string, ofs?: number };
export type ITradesInfoParams = { txid: string, trades?: boolean };
export type IOpenPositionsParams = { txid: string, docalcs?: boolean };
export type ILedgersParams =
    { aclass?: string, asset?: string, type?: string, start?: string, end?: string, ofs?: number };
export type IQueryLedgersParams = { id: string };
export type ITradeVolumeParams = { pair?: string, 'fee-info'?: string };

// private user trading

export type IAddOrderParams = {
    [key: string]: string | number | boolean,
    pair: string,
    type: string,
    ordertype: string,
    price?: number,
    price2?: number,
    volume: number,
    leverage?: number,
    oflags?: string,
    starttm?: string,
    expiretm?: string,
    userref?: string,
    validate?: boolean,
    'close[ordertype]'?: string,
    'close[price]'?: number,
    'close[price2]'?: number,
};

export type ICancelOpenOrderParams = { txid: string; };

// private user funding

export type IDepositMethodsParams = { aclass?: string, asset: string };
export type IDepositAddressesParams = {
    [key: string]: string | boolean,
    aclass?: string,
    asset: string,
    method: string,
    'new'?: boolean,
};

export type IDepositStatusParams = { aclass?: string, asset: string, method: string };
export type IWithdrawInfoParams = { aclass?: string, asset: string, key: string, amount: number };
export type IWithdrawParams = { aclass?: string, asset: string, key: string, amount: number };
export type IWithdrawStatusParams = { aclass?: string, asset: string, method?: string };
export type IWithdrawCancelParams = { aclass?: string, asset: string, refid: string };

/**
 * The user client shape.
 */
export interface IKrakenClient {

    rawAgent: IRawAgent;

    isUpgraded(): boolean;

    upgrade(newAuth: IApiAuth): void;

    getServerTime(): Promise<IKrakenResponse>;

    getAssetInfo(queryParams?: IAssetsParams): Promise<IKrakenResponse>;

    getTradableAssetPairs(queryParams?: IAssetPairsParams): Promise<IKrakenResponse>;

    getTickerInformation(queryParams: ITickerParams): Promise<IKrakenResponse>;

    getOhlcData(queryParams: IOhlcParams): Promise<IKrakenResponse>;

    getOrderBook(queryParams: IDepthParams): Promise<IKrakenResponse>;

    getRecentTrades(queryParams: ITradesParams): Promise<IKrakenResponse>;

    getRecentSpreadData(queryParams: ISpreadParams): Promise<IKrakenResponse>;

    getAccountBalance(): Promise<IKrakenResponse>;

    getTradeBalance(queryParams?: ITradeBalanceParams): Promise<IKrakenResponse>;

    getOpenOrders(queryParams?: IOpenOrdersParams): Promise<IKrakenResponse>;

    getClosedOrders(queryParams?: IClosedOrdersParams): Promise<IKrakenResponse>;

    queryOrdersInfo(queryParams: IOrdersInfoParams): Promise<IKrakenResponse>;

    getTradesHistory(queryParams?: ITradesHistoryParams): Promise<IKrakenResponse>;

    queryTradesInfo(queryParams: ITradesInfoParams): Promise<IKrakenResponse>;

    getOpenPositions(queryParams: IOpenPositionsParams): Promise<IKrakenResponse>;

    getLedgersInfo(queryParams?: ILedgersParams): Promise<IKrakenResponse>;

    queryLedgers(queryParams: IQueryLedgersParams): Promise<IKrakenResponse>;

    getTradeVolume(queryParams?: ITradeVolumeParams): Promise<IKrakenResponse>;

    addStandardOrder(queryParams: IAddOrderParams): Promise<IKrakenResponse>;

    cancelOpenOrder(queryParams: ICancelOpenOrderParams): Promise<IKrakenResponse>;

    getDepositMethods(queryParams: IDepositMethodsParams): Promise<IKrakenResponse>;

    getDepositAddresses(queryParams: IDepositAddressesParams): Promise<IKrakenResponse>;

    getStatusOfRecentDeposits(queryParams: IDepositStatusParams): Promise<IKrakenResponse>;

    getWithdrawalInformation(queryParams: IWithdrawInfoParams): Promise<IKrakenResponse>;

    withdrawFunds(queryParams: IWithdrawParams): Promise<IKrakenResponse>;

    getStatusOfRecentWithdrawals(queryParams: IWithdrawStatusParams): Promise<IKrakenResponse>;

    requestWithdrawalCancellation(queryParams: IWithdrawCancelParams): Promise<IKrakenResponse>;
}


/**
 * Factory function to get a new Kraken client.
 *
 * @param {IApiAuth} auth
 * @returns {IKrakenClient}
 */
export const getClient = (auth?: IApiAuth): IKrakenClient => ({

    rawAgent: getRawAgent(auth),

    isUpgraded(): boolean { return this.rawAgent.isUpgraded(); },

    upgrade(newAuth: IApiAuth): void { this.rawAgent.upgrade(newAuth); },

    async getServerTime(): Promise<IKrakenResponse> {
        return this.rawAgent.getPublicEndpoint('Time');
    },

    async getAssetInfo(queryParams?: IAssetsParams): Promise<IKrakenResponse> {
        const params = queryParams ?
                       (({ info, aclass, asset }) =>
                           ({ info, aclass, asset }))(queryParams) :
                       null;

        return this.rawAgent.getPublicEndpoint('Assets', params);
    },

    async getTradableAssetPairs(queryParams?: IAssetPairsParams): Promise<IKrakenResponse> {
        const params = queryParams ?
                       (({ info, pair }) =>
                           ({ info, pair }))(queryParams) :
                       null;

        return this.rawAgent.getPublicEndpoint('AssetPairs', params);
    },

    async getTickerInformation(queryParams: ITickerParams): Promise<IKrakenResponse> {
        const params = (({ pair }) =>
            ({ pair }))(queryParams);

        return this.rawAgent.getPublicEndpoint('Ticker', params);
    },

    async getOhlcData(queryParams: IOhlcParams): Promise<IKrakenResponse> {
        const params = (({ pair, interval, since }) =>
            ({ pair, interval, since }))(queryParams);

        return this.rawAgent.getPublicEndpoint('OHLC', params);
    },

    async getOrderBook(queryParams: IDepthParams): Promise<IKrakenResponse> {
        const params = (({ pair, count }) =>
            ({ pair, count }))(queryParams);

        return this.rawAgent.getPublicEndpoint('Depth', params);
    },

    async getRecentTrades(queryParams: ITradesParams): Promise<IKrakenResponse> {
        const params = (({ pair, since }) =>
            ({ pair, since }))(queryParams);

        return this.rawAgent.getPublicEndpoint('Trades', params);
    },

    async getRecentSpreadData(queryParams: ISpreadParams): Promise<IKrakenResponse> {
        const params = (({ pair, since }) =>
            ({ pair, since }))(queryParams);

        return this.rawAgent.getPublicEndpoint('Spread', params);
    },

    async getAccountBalance(): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = { nonce };

        return this.rawAgent.postToPrivateEndpoint('Balance', params);
    },

    async getTradeBalance(queryParams?: ITradeBalanceParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = queryParams ?
                       (({ aclass, asset }) =>
                           ({ nonce, aclass, asset }))(queryParams) :
                       { nonce };

        return this.rawAgent.postToPrivateEndpoint('TradeBalance', params);
    },

    async getOpenOrders(queryParams?: IOpenOrdersParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = queryParams ?
                       (({ trades, userref }) =>
                           ({ nonce, trades, userref }))(queryParams) :
                       { nonce };

        return this.rawAgent.postToPrivateEndpoint('OpenOrders', params);
    },

    async getClosedOrders(queryParams?: IClosedOrdersParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = queryParams ?
                       (({ trades, userref, start, end, ofs, closetime }) =>
                           ({ nonce, trades, userref, start, end, ofs, closetime }))(queryParams) :
                       { nonce };

        return this.rawAgent.postToPrivateEndpoint('ClosedOrders', params);
    },

    async queryOrdersInfo(queryParams: IOrdersInfoParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = queryParams ?
                       (({ trades, userref, txid }) =>
                           ({ nonce, trades, userref, txid }))(queryParams) :
                       { nonce };

        return this.rawAgent.postToPrivateEndpoint('QueryOrders', params);
    },

    async getTradesHistory(queryParams?: ITradesHistoryParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = queryParams ?
                       (({ type, trades, start, end, ofs }) =>
                           ({ nonce, type, trades, start, end, ofs }))(queryParams) :
                       { nonce };

        return this.rawAgent.postToPrivateEndpoint('TradesHistory', params);
    },

    async queryTradesInfo(queryParams: ITradesInfoParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ txid, trades }) =>
            ({ nonce, txid, trades }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('QueryTrades', params);
    },

    async getOpenPositions(queryParams: IOpenPositionsParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ txid, docalcs }) =>
            ({ nonce, txid, docalcs }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('OpenPositions', params);
    },

    async getLedgersInfo(queryParams?: ILedgersParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = queryParams ?
                       (({ aclass, asset, type, start, end, ofs }) =>
                           ({ nonce, aclass, asset, type, start, end, ofs }))(queryParams) :
                       { nonce };

        return this.rawAgent.postToPrivateEndpoint('Ledgers', params);
    },

    async queryLedgers(queryParams: IQueryLedgersParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ id }) =>
            ({ nonce, id }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('QueryLedgers', params);
    },

    async getTradeVolume(queryParams?: ITradeVolumeParams): Promise<IKrakenResponse> {
        const nonce                       = generateNonce();
        const params: { [k: string]: {} } = queryParams ?
                                            (({ pair }) =>
                                                ({ nonce, pair }))(queryParams) :
                                            { nonce };

        //tslint:disable:no-string-literal
        //NOTE: only because hyphens don't work through the shorthand
        params['fee-info'] = queryParams['fee-info'];
        //tslint:enable:no-string-literal

        return this.rawAgent.postToPrivateEndpoint('TradeVolume', params);
    },

    async addStandardOrder(queryParams: IAddOrderParams): Promise<IKrakenResponse> {
        const nonce    = generateNonce();
        const required = (({ pair, type, ordertype }) =>
            ({ nonce, pair, type, ordertype }))(queryParams);

        const optional = (({ price, price2, volume, leverage, oflags, starttm, expiretm, userref, validate }) =>
            ({ price, price2, volume, leverage, oflags, starttm, expiretm, userref, validate }))(queryParams);

        //tslint:disable:object-literal-sort-keys
        const optionalClose = ((orderParams: IAddOrderParams) => ({
            'close[type]'  : orderParams['close[type]'],
            'close[price]' : orderParams['close[price]'],
            'close[price2]': orderParams['close[price2]'],
        }))(queryParams);
        //tslint:enable:object-literal-sort-keys

        const params = { ...required, ...optional, ...optionalClose };

        return this.rawAgent.postToPrivateEndpoint('AddOrder', params);
    },

    async cancelOpenOrder(queryParams: ICancelOpenOrderParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ txid }) =>
            ({ nonce, txid }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('CancelOrder', params);
    },

    async getDepositMethods(queryParams: IDepositMethodsParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ aclass, asset }) =>
            ({ nonce, aclass, asset }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('DepositMethods', params);
    },

    async getDepositAddresses(queryParams: IDepositAddressesParams): Promise<IKrakenResponse> {
        const nonce                       = generateNonce();
        const params: { [k: string]: {} } = (({ aclass, asset, method }) =>
            ({ nonce, aclass, asset, method }))(queryParams);

        //tslint:disable:no-string-literal
        //NOTE: only because keyword 'new' doesn't work through this shorthand
        params['new'] = queryParams['new'];
        //tslint:enable:no-string-literal

        return this.rawAgent.postToPrivateEndpoint('DepositAddresses', params);
    },

    async getStatusOfRecentDeposits(queryParams: IDepositStatusParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ aclass, asset }) =>
            ({ nonce, aclass, asset }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('DepositMethods', params);
    },

    async getWithdrawalInformation(queryParams: IWithdrawInfoParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ aclass, asset }) =>
            ({ nonce, aclass, asset }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('DepositMethods', params);
    },

    async withdrawFunds(queryParams: IWithdrawParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ aclass, asset }) =>
            ({ nonce, aclass, asset }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('DepositMethods', params);
    },

    async getStatusOfRecentWithdrawals(queryParams: IWithdrawStatusParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ aclass, asset }) =>
            ({ nonce, aclass, asset }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('DepositMethods', params);
    },

    async requestWithdrawalCancellation(queryParams: IWithdrawCancelParams): Promise<IKrakenResponse> {
        const nonce  = generateNonce();
        const params = (({ aclass, asset }) =>
            ({ nonce, aclass, asset }))(queryParams);

        return this.rawAgent.postToPrivateEndpoint('DepositMethods', params);
    },
});

/**
 * Alias for Axios request options.
 */
export interface IKrakenRequestConfig extends AxiosRequestConfig {}

/**
 * Alias for Axios response.
 */
export interface IKrakenResponse extends AxiosResponse {}
