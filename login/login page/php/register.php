<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'config/database.php';
require_once 'config/mongodb.php';

// Get POST data
$username = isset($_POST['username']) ? trim($_POST['username']) : '';
$email = isset($_POST['email']) ? trim($_POST['email']) : '';
$password = isset($_POST['password']) ? $_POST['password'] : '';

// Validate input
if (empty($username) || empty($email) || empty($password)) {
    echo json_encode(array(
        "success" => false,
        "message" => "All fields are required"
    ));
    exit();
}

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(array(
        "success" => false,
        "message" => "Invalid email format"
    ));
    exit();
}

// Validate username length
if (strlen($username) < 3) {
    echo json_encode(array(
        "success" => false,
        "message" => "Username must be at least 3 characters"
    ));
    exit();
}

// Validate password length
if (strlen($password) < 6) {
    echo json_encode(array(
        "success" => false,
        "message" => "Password must be at least 6 characters"
    ));
    exit();
}

try {
    // Connect to MySQL
    $database = new Database();
    $db = $database->getConnection();
    
    // Check if username already exists (using prepared statement)
    $query = "SELECT id FROM users WHERE username = :username";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':username', $username);
    $stmt->execute();
    
    if ($stmt->rowCount() > 0) {
        echo json_encode(array(
            "success" => false,
            "message" => "Username already exists"
        ));
        exit();
    }
    
    // Check if email already exists (using prepared statement)
    $query = "SELECT id FROM users WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $email);
    $stmt->execute();
    
    if ($stmt->rowCount() > 0) {
        echo json_encode(array(
            "success" => false,
            "message" => "Email already registered"
        ));
        exit();
    }
    
    // Hash password
    $password_hash = password_hash($password, PASSWORD_BCRYPT);
    
    // Insert user into MySQL (using prepared statement)
    $query = "INSERT INTO users (username, email, password_hash) VALUES (:username, :email, :password_hash)";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':username', $username);
    $stmt->bindParam(':email', $email);
    $stmt->bindParam(':password_hash', $password_hash);
    
    if ($stmt->execute()) {
        $user_id = $db->lastInsertId();
        
        // Create initial profile in MongoDB
        try {
            $mongodb = new MongoDB_Connection();
            $manager = $mongodb->getClient();
            $db_name = $mongodb->getDatabase();
            
            $bulk = new MongoDB\Driver\BulkWrite;
            $profile_doc = [
                'user_id' => (int)$user_id,
                'username' => $username,
                'email' => $email,
                'age' => null,
                'dob' => null,
                'contact' => null,
                'address' => null,
                'created_at' => new MongoDB\BSON\UTCDateTime()
            ];
            $bulk->insert($profile_doc);
            
            $manager->executeBulkWrite($db_name . '.user_profiles', $bulk);
            
            echo json_encode(array(
                "success" => true,
                "message" => "Registration successful! Redirecting to login..."
            ));
        } catch (Exception $e) {
            echo json_encode(array(
                "success" => false,
                "message" => "User created but profile initialization failed: " . $e->getMessage()
            ));
        }
    } else {
        echo json_encode(array(
            "success" => false,
            "message" => "Registration failed. Please try again."
        ));
    }
    
} catch (PDOException $e) {
    echo json_encode(array(
        "success" => false,
        "message" => "Database error: " . $e->getMessage()
    ));
}
?>
