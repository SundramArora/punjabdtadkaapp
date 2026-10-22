angular.module('MainController', [])
  .controller('mainController', ['$location', 'Auth', function($location, Auth) {
    var vm = this;
    vm.isLoggedIn = Auth.isLogged();
    vm.loginData = {};

    function loadUser() {
      if (!Auth.isLogged()) {
        vm.user = null;
        return;
      }
      Auth.getUser().then(function(response) {
        vm.user = response.data;
      }, function() {
        vm.user = null;
        vm.isLoggedIn = false;
      });
    }

    loadUser();

    vm.login = function() {
      vm.error = '';
      Auth.login(vm.loginData.username, vm.loginData.password)
        .then(function(response) {
          vm.user = response.data.user;
          vm.isLoggedIn = true;
          $location.path('/');
        }).catch(function(response) {
          vm.error = response.data && response.data.message
            ? response.data.message
            : 'Unable to sign in.';
        });
    };

    vm.logout = function() {
      Auth.logout();
      vm.user = null;
      vm.isLoggedIn = false;
      $location.path('/login');
    };
  }]);