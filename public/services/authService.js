var authService = angular.module('authService', []);

authService.factory('Auth', function($http, $location, $q, AuthToken) {


    var authFactory = {};

    authFactory.login = function(username,password) {

        return $http.post('/api/login', {
            username: username,
            password: password
        }).success(function(data) {
            AuthToken.setToken(data.token);
            return data;         
        })
    }


    authFactory.getUser = function() {

       if (AuthToken.getToken()) {
           return $http.get('/api/me');
       } else {
           return $q.reject({message: 'unable to get data'});
       }
    }


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
      if (response.status === 403) {
          $location.path('/login');
          return $q.reject(response);
      }
    }
});