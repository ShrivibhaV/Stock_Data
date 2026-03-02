$(document).ready(function () {
    // Check if user is logged in
    const sessionId = localStorage.getItem('session_id');
    const username = localStorage.getItem('username');

    if (!sessionId) {
        // Redirect to login if not logged in
        window.location.href = 'login.html';
        return;
    }

    // Display username
    $('#displayUsername').text(username || 'User');

    // Load profile data
    loadProfile();

    // Profile form submission
    $('#profileForm').on('submit', function (e) {
        e.preventDefault();
        updateProfile();
    });

    // Logout button
    $('#logoutBtn').on('click', function () {
        logout();
    });

    // Load profile function
    function loadProfile() {
        $.ajax({
            url: 'php/profile.php',
            type: 'GET',
            dataType: 'json',
            data: {
                session_id: sessionId
            },
            success: function (response) {
                if (response.success) {
                    // Populate form with profile data
                    $('#username').val(response.data.username || '');
                    $('#email').val(response.data.email || '');
                    $('#age').val(response.data.age || '');
                    $('#dob').val(response.data.dob || '');
                    $('#contact').val(response.data.contact || '');
                    $('#address').val(response.data.address || '');
                } else {
                    if (response.message === 'Invalid or expired session') {
                        showAlert('Session expired. Please login again.', 'danger');
                        setTimeout(function () {
                            logout();
                        }, 2000);
                    } else {
                        showAlert(response.message, 'danger');
                    }
                }
            },
            error: function (xhr, status, error) {
                showAlert('Failed to load profile data.', 'danger');
                console.error('Error:', error);
            }
        });
    }

    // Update profile function
    function updateProfile() {
        // Clear previous alerts
        $('#alert-container').html('');

        // Get form values
        const age = $('#age').val();
        const dob = $('#dob').val();
        const contact = $('#contact').val();
        const address = $('#address').val();

        // Show loading state
        setLoadingState(true);

        // AJAX request to update profile
        $.ajax({
            url: 'php/profile.php',
            type: 'POST',
            dataType: 'json',
            data: {
                session_id: sessionId,
                age: age,
                dob: dob,
                contact: contact,
                address: address
            },
            success: function (response) {
                setLoadingState(false);

                if (response.success) {
                    showAlert(response.message, 'success');
                } else {
                    if (response.message === 'Invalid or expired session') {
                        showAlert('Session expired. Please login again.', 'danger');
                        setTimeout(function () {
                            logout();
                        }, 2000);
                    } else {
                        showAlert(response.message, 'danger');
                    }
                }
            },
            error: function (xhr, status, error) {
                setLoadingState(false);
                showAlert('Failed to update profile. Please try again.', 'danger');
                console.error('Error:', error);
            }
        });
    }

    // Logout function
    function logout() {
        $.ajax({
            url: 'php/logout.php',
            type: 'POST',
            dataType: 'json',
            data: {
                session_id: sessionId
            },
            success: function (response) {
                // Clear localStorage
                localStorage.removeItem('session_id');
                localStorage.removeItem('username');

                // Redirect to login
                window.location.href = 'login.html';
            },
            error: function (xhr, status, error) {
                // Clear localStorage anyway
                localStorage.removeItem('session_id');
                localStorage.removeItem('username');

                // Redirect to login
                window.location.href = 'login.html';
            }
        });
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
            $('#updateBtn').prop('disabled', true);
            $('#updateBtn .btn-text').addClass('d-none');
            $('#updateBtn .spinner-border').removeClass('d-none');
        } else {
            $('#updateBtn').prop('disabled', false);
            $('#updateBtn .btn-text').removeClass('d-none');
            $('#updateBtn .spinner-border').addClass('d-none');
        }
    }
});
