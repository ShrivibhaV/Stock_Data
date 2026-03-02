<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'config/redis.php';

// Get session ID
$session_id = isset($_POST['session_id']) ? $_POST['session_id'] : '';

if (empty($session_id)) {
    echo json_encode(array(
        "success" => false,
        "message" => "Session ID is required"
    ));
    exit();
}

try {
    // Delete session from Redis
    $redis = new Redis_Connection();
    $result = $redis->deleteSession($session_id);
    
    if ($result) {
        echo json_encode(array(
            "success" => true,
            "message" => "Logged out successfully"
        ));
    } else {
        echo json_encode(array(
            "success" => false,
            "message" => "Failed to logout"
        ));
    }
    
} catch (Exception $e) {
    echo json_encode(array(
        "success" => false,
        "message" => "Error: " . $e->getMessage()
    ));
}
?>
