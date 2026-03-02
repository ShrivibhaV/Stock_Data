<?php
// MySQL Database Configuration
class Database {
    private $host = "localhost";
    private $db_name = "user_auth_system";
    private $username = "root";
    private $password = "";
    private $conn;

    public function getConnection() {
        $this->conn = null;

        try {
            $this->conn = new PDO(
                "mysql:host=" . $this->host . ";dbname=" . $this->db_name,
                $this->username,
                $this->password,
                array(
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                )
            );
        } catch(PDOException $e) {
            echo json_encode(array(
                "success" => false,
                "message" => "Database connection failed: " . $e->getMessage()
            ));
            exit();
        }

        return $this->conn;
    }
}
?>
