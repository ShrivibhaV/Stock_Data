<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'config/database.php';
require_once 'config/redis.php';

// Get POST data
$username = isset($_POST['username']) ? trim($_POST['username']) : '';
$password = isset($_POST['password']) ? $_POST['password'] : '';

// Validate input
if (empty($username) || empty($password)) {
    echo json_encode(array(
        "success" => false,
        "message" => "Username and password are required"
    ));
    exit();
}

try {
    // Connect to MySQL
    $database = new Database();
    $db = $database->getConnection();
    
    // Check if username or email exists (using prepared statement)
    $query = "SELECT id, username, email, password_hash FROM users WHERE username = :username OR email = :username";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':username', $username);
    $stmt->execute();
    
    if ($stmt->rowCount() === 0) {
        echo json_encode(array(
            "success" => false,
            "message" => "Invalid username or password"
        ));
        exit();
    }
    
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Verify password
    if (!password_verify($password, $user['password_hash'])) {
        echo json_encode(array(
            "success" => false,
            "message" => "Invalid username or password"
        ));
        exit();
    }
    
    // Generate unique session ID
    $session_id = bin2hex(random_bytes(32));
    
    // Prepare session data
    $session_data = array(
        'user_id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'login_time' => time()
    );
    
    // Store session in Redis
    $redis = new Redis_Connection();
    if ($redis->setSession($session_id, $session_data, 86400)) { // 24 hours TTL
        echo json_encode(array(
            "success" => true,
            "message" => "Login successful!",
            "session_id" => $session_id,
            "username" => $user['username']
        ));
    } else {
        echo json_encode(array(
            "success" => false,
            "message" => "Failed to create session. Please try again."
        ));
    }
    
} catch (PDOException $e) {
    echo json_encode(array(
        "success" => false,
        "message" => "Database error: " . $e->getMessage()
    ));
} catch (Exception $e) {
    echo json_encode(array(
        "success" => false,
        "message" => "Error: " . $e->getMessage()
    ));
}
?>
