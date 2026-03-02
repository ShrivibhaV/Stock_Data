$(document).ready(function() {
    // Form submission handler
    $('#registerForm').on('submit', function(e) {
        e.preventDefault();
        
        // Clear previous alerts
        $('#alert-container').html('');
        
        // Get form values
        const username = $('#username').val().trim();
        const email = $('#email').val().trim();
        const password = $('#password').val();
        const confirmPassword = $('#confirmPassword').val();
        
        // Client-side validation
        if (username.length < 3) {
            showAlert('Username must be at least 3 characters long', 'danger');
            return;
        }
        
        if (!isValidEmail(email)) {
            showAlert('Please enter a valid email address', 'danger');
            return;
        }
        
        if (password.length < 6) {
            showAlert('Password must be at least 6 characters long', 'danger');
            return;
        }
        
        if (password !== confirmPassword) {
            showAlert('Passwords do not match', 'danger');
            return;
        }
        
        // Show loading state
        setLoadingState(true);
        
        // AJAX request to register.php
        $.ajax({
            url: 'php/register.php',
            type: 'POST',
            dataType: 'json',
            data: {
                username: username,
                email: email,
                password: password
            },
            success: function(response) {
                setLoadingState(false);
                
                if (response.success) {
                    showAlert(response.message, 'success');
                    // Redirect to login page after 2 seconds
                    setTimeout(function() {
                        window.location.href = 'login.html';
                    }, 2000);
                } else {
                    showAlert(response.message, 'danger');
                }
            },
            error: function(xhr, status, error) {
                setLoadingState(false);
                showAlert('An error occurred. Please try again.', 'danger');
                console.error('Error:', error);
            }
        });
    });
    
    // Email validation function
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
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
            $('#registerBtn').prop('disabled', true);
            $('#registerBtn .btn-text').addClass('d-none');
            $('#registerBtn .spinner-border').removeClass('d-none');
        } else {
            $('#registerBtn').prop('disabled', false);
            $('#registerBtn .btn-text').removeClass('d-none');
            $('#registerBtn .spinner-border').addClass('d-none');
        }
    }
});
