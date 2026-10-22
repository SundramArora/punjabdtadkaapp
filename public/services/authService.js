var authService = angular.module('authService', []);

authService.factory('Auth', function($http, $location, $q, AuthToken) {


    var authFactory = {};

    authFactory.isLogged = function() {
        return Boolean(AuthToken.getToken());
    };

    authFactory.login = function(username,password) {
        return $http.post('/api/login', {
            username: username,
            password: password
        }).then(function(response) {
            if (!response.data || !response.data.token) {
                return $q.reject({message:'Authentication response did not include a token.'});
            }
            AuthToken.setToken(response.data && response.data.token);
            return response;
        });
    }


    authFactory.getUser = function() {

       if (AuthToken.getToken()) {
           return $http.get('/api/me', {
               headers:{'x-access-token':AuthToken.getToken()}
           });
       } else {
           return $q.reject({message: 'unable to get data'});
       }
    }

    authFactory.logout = function() {
        AuthToken.setToken(null);
    };

    return authFactory;

});

authService.factory('AuthToken', function($window) {

    var authTokenFactory = {};

    authTokenFactory.getToken = function() {
        return $window.localStorage.getItem('token');
    }

    authTokenFactory.setToken = function(token) {
        if (token) {
            $window.localStorage.setItem('token', token);
        } else {
            $window.localStorage.removeItem('token');
        }
    }  
    return authTokenFactory;   
});

authService.factory('AuthInterceptor', function($q, $location, AuthToken) {

var interceptorFactory = {};


interceptorFactory.request = function(config) {
    var token = AuthToken.getToken();
    if(token) {

        config.headers['x-access-token'] = token;
    }
    return config;
};

interceptorFactory.responseError = function(response) {
      if (response.status === 401 || response.status === 403) {
          AuthToken.setToken(null);
          $location.path('/login');
      }
      return $q.reject(response);
    }

    return interceptorFactory;
});