angular.module('myApp', ['ngRoute', 'appRoutes', 'authService', 'MainController'])
    .config(['$httpProvider', function($httpProvider) {
        $httpProvider.interceptors.push('AuthInterceptor');
    }]);
