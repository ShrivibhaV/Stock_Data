$(document).ready(function () {
    // Check if user is already logged in
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
        // Redirect to profile if already logged in
        window.location.href = 'profile.html';
    }

    // Form submission handler
    $('#loginForm').on('submit', function (e) {
        e.preventDefault();

        // Clear previous alerts
        $('#alert-container').html('');

        // Get form values
        const username = $('#username').val().trim();
        const password = $('#password').val();

        // Client-side validation
        if (username.length === 0) {
            showAlert('Please enter your username or email', 'danger');
            return;
        }

        if (password.length === 0) {
            showAlert('Please enter your password', 'danger');
            return;
        }

        // Show loading state
        setLoadingState(true);

        // AJAX request to login.php
        $.ajax({
            url: 'php/login.php',
            type: 'POST',
            dataType: 'json',
            data: {
                username: username,
                password: password
            },
            success: function (response) {
                setLoadingState(false);

                if (response.success) {
                    // Store session ID in localStorage
                    localStorage.setItem('session_id', response.session_id);
                    localStorage.setItem('username', response.username);

                    showAlert(response.message, 'success');

                    // Redirect to profile page after 1 second
                    setTimeout(function () {
                        window.location.href = 'profile.html';
                    }, 1000);
                } else {
                    showAlert(response.message, 'danger');
                }
            },
            error: function (xhr, status, error) {
                setLoadingState(false);
                showAlert('An error occurred. Please try again.', 'danger');
                console.error('Error:', error);
            }
        });
    });

    // Show alert message
    function showAlert(message, type) {
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        $('#alert-container').html(alertHtml);
    }

    // Set loading state
    function setLoadingState(isLoading) {
        if (isLoading) {
            $('#loginBtn').prop('disabled', true);
            $('#loginBtn .btn-text').addClass('d-none');
            $('#loginBtn .spinner-border').removeClass('d-none');
        } else {
            $('#loginBtn').prop('disabled', false);
            $('#loginBtn .btn-text').removeClass('d-none');
            $('#loginBtn .spinner-border').addClass('d-none');
        }
    }
});
