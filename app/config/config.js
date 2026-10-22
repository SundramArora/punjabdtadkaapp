var environment = process.env.NODE_ENV || 'development';
var config = require('./env/' + environment + '.js');
var requiredSecrets = ['secret', 'refreshTokenSecret', 'sessionSecret'];

requiredSecrets.forEach(function(key) {
    if (typeof config[key] !== 'string' || config[key].length < 32) {
        throw new Error(key + ' must be configured with at least 32 characters.');
    }
});

if (environment === 'production' && (!config.mongodbUrl || !config.sharedMongodbUrl)) {
    throw new Error('MONGODB_URL and SHARED_MONGODB_URL must be configured in production.');
}

module.exports = config;