module.exports = {
    //sharedMongodbUrl: 'mongodb://incites-app:incitesApp2018*@incites-dev-shard-00-00-tflz5.mongodb.net:27017,incites-dev-shard-00-01-tflz5.mongodb.net:27017,incites-dev-shard-00-02-tflz5.mongodb.net:27017/shared?ssl=true&replicaSet=incites-dev-shard-0&authSource=admin',
    sharedMongodbUrl     : 'mongodb://localhost:27017/pdt',
    mongodbUrl           : 'mongodb://localhost:27017/pdt',
    devmongodbUrl        : 'mongodb://localhost:27017/pdt',
    rollbarKey           : '7e3e892c5cbb44f693f4191500650daf',
    sessionSecret        : 'bxMNTg5Relcrj5HNqKNBHpjpoWrSBiaRXGfDBiZW',
    secret               : "punjabdtadka",
    refreshTokenSecret   : "punjabdtadkarefresh",
    port                 : 8091,
    tokenLife            : 900,
    refreshTokenLife     : 86400,
    facebook_api_key     :     "429167974235293",
    facebook_api_secret  :     "3c3d4fb6a3532c1ee59b39ca5c006a48",
    callback_url         :     "http://localhost:8091/auth/facebook/callback",
    enableProof          : true
}