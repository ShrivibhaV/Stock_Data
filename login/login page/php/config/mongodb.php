<?php
// MongoDB Configuration
class MongoDB_Connection {
    private $host = "localhost";
    private $port = "27017";
    private $db_name = "user_profiles_db";
    private $client;
    private $db;

    public function getDatabase() {
        try {
            $this->client = new MongoDB\Driver\Manager("mongodb://" . $this->host . ":" . $this->port);
            return $this->db_name;
        } catch(Exception $e) {
            echo json_encode(array(
                "success" => false,
                "message" => "MongoDB connection failed: " . $e->getMessage()
            ));
            exit();
        }
    }

    public function getClient() {
        try {
            $this->client = new MongoDB\Driver\Manager("mongodb://" . $this->host . ":" . $this->port);
            return $this->client;
        } catch(Exception $e) {
            echo json_encode(array(
                "success" => false,
                "message" => "MongoDB connection failed: " . $e->getMessage()
            ));
            exit();
        }
    }
}
?>
