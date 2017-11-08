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
    timeout: 5000,
    version: 0,
};

/**
 * Default HTTP agent configuration.
 */
const defaultAgentConfig = {
    baseURL: defaultConfig.rootUrl,
    headers: {
        'User-Agent': `Kraken API Client (kraken-api node package)`,
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
 */
export interface IPostBody {
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
 * Convenient container for API keys.
 */
export interface IApiAuth {
    publicKey: string;
    privateKey: string;
}

/**
 * The shape of a Kraken client.
 */
export interface IKrakenClient {
    auth?: IApiAuth;

    isUpgraded(): boolean;

    getPublicEndpoint(endpoint: string,
                      queryParams?: {},
                      configOverride?: IKrakenRequestConfig): Promise<IKrakenResponse>;

    postToPrivateEndpoint(endpoint: string,
                          data: IPostBody,
                          configOverride?: IKrakenRequestConfig): Promise<IKrakenResponse>;

    signMessage(url: string, postBody: IPostBody, privateKey: string): string;

    upgrade(newAuth: IApiAuth): void;
}

/**
 * Factory function to get a new Kraken client.
 *
 * @param {IApiAuth} auth
 * @returns {IKrakenClient}
 */
export const getClient = (auth?: IApiAuth): IKrakenClient => ({

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
                            configOverride?: {}): Promise<IKrakenResponse> {

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

/**
 * Alias for Axios request options.
 */
export interface IKrakenRequestConfig extends AxiosRequestConfig {}

/**
 * Alias for Axios response.
 */
export interface IKrakenResponse extends AxiosResponse {}
