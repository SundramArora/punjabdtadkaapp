angular.module('MainController', [])

    .controller('mainController', ['$rootScope','$location','Auth', function($rootScope,$location, Auth) {

    var vm = this;

    vm.isLoggedIn = Auth.isLogged();

    $rootScope.$on('$routeChangeStart', function() {

        vm.isLoggedIn = Auth.isLogged();
            Auth.getUser().then(function(data) {
                vm.user = data.data;
            })                              
        })


    vm.login = function() {      
        vm.error = '';

        Auth.login(vm.loginData.username, vm.loginData.password)
        .then(function(data) {
            Auth.getUser()
            .then(function(data) {
                vm.user = data.data;
            });

            if (data.success) {
                $location.path('/');
            } else {
                vm.error = data.message;
                console.log(vm.error);
            }

        });
    }