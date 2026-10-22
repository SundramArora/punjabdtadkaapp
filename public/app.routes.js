angular.module('appRoutes', ['ngRoute'])
    .config(['$routeProvider', function($routeProvider) {
        $routeProvider
            .when('/', {
                templateUrl: '/login.html'
            })
            .when('/login', {
                templateUrl: '/login.html'
            })
            .otherwise({
                redirectTo: '/login'
            });
    }]);
