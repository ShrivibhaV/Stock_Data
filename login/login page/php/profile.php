<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'config/redis.php';
require_once 'config/mongodb.php';

// Get session ID from request
$session_id = isset($_GET['session_id']) ? $_GET['session_id'] : (isset($_POST['session_id']) ? $_POST['session_id'] : '');

if (empty($session_id)) {
    echo json_encode(array(
        "success" => false,
        "message" => "Session ID is required"
    ));
    exit();
}

// Validate session using Redis
$redis = new Redis_Connection();
$session_data = $redis->getSession($session_id);

if (!$session_data) {
    echo json_encode(array(
        "success" => false,
        "message" => "Invalid or expired session"
    ));
    exit();
}

$user_id = $session_data['user_id'];

try {
    $mongodb = new MongoDB_Connection();
    $manager = $mongodb->getClient();
    $db_name = $mongodb->getDatabase();
    
    // Handle GET request - Fetch profile
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $filter = ['user_id' => (int)$user_id];
        $query = new MongoDB\Driver\Query($filter);
        $cursor = $manager->executeQuery($db_name . '.user_profiles', $query);
        
        $profile = null;
        foreach ($cursor as $document) {
            $profile = $document;
            break;
        }
        
        if ($profile) {
            echo json_encode(array(
                "success" => true,
                "data" => array(
                    "username" => $session_data['username'],
                    "email" => $session_data['email'],
                    "age" => isset($profile->age) ? $profile->age : null,
                    "dob" => isset($profile->dob) ? $profile->dob : null,
                    "contact" => isset($profile->contact) ? $profile->contact : null,
                    "address" => isset($profile->address) ? $profile->address : null
                )
            ));
        } else {
            echo json_encode(array(
                "success" => false,
                "message" => "Profile not found"
            ));
        }
    }
    // Handle POST request - Update profile
    else if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $age = isset($_POST['age']) && $_POST['age'] !== '' ? (int)$_POST['age'] : null;
        $dob = isset($_POST['dob']) && $_POST['dob'] !== '' ? $_POST['dob'] : null;
        $contact = isset($_POST['contact']) && $_POST['contact'] !== '' ? trim($_POST['contact']) : null;
        $address = isset($_POST['address']) && $_POST['address'] !== '' ? trim($_POST['address']) : null;
        
        // Update profile in MongoDB
        $bulk = new MongoDB\Driver\BulkWrite;
        $filter = ['user_id' => (int)$user_id];
        $update = [
            '$set' => [
                'age' => $age,
                'dob' => $dob,
                'contact' => $contact,
                'address' => $address,
                'updated_at' => new MongoDB\BSON\UTCDateTime()
            ]
        ];
        
        $bulk->update($filter, $update, ['multi' => false, 'upsert' => false]);
        $result = $manager->executeBulkWrite($db_name . '.user_profiles', $bulk);
        
        if ($result->getModifiedCount() > 0 || $result->getMatchedCount() > 0) {
            echo json_encode(array(
                "success" => true,
                "message" => "Profile updated successfully!"
            ));
        } else {
            echo json_encode(array(
                "success" => false,
                "message" => "Failed to update profile"
            ));
        }
    }
    
} catch (Exception $e) {
    echo json_encode(array(
        "success" => false,
        "message" => "Error: " . $e->getMessage()
    ));
}
?>
