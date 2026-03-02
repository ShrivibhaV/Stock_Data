<?php
// Redis Configuration for Session Management
class Redis_Connection {
    private $host = "127.0.0.1";
    private $port = 6379;
    private $redis;

    public function getConnection() {
        try {
            $this->redis = new Redis();
            $this->redis->connect($this->host, $this->port);
            return $this->redis;
        } catch(Exception $e) {
            echo json_encode(array(
                "success" => false,
                "message" => "Redis connection failed: " . $e->getMessage()
            ));
            exit();
        }
    }

    public function setSession($session_id, $user_data, $ttl = 86400) {
        try {
            $redis = $this->getConnection();
            $key = "session:" . $session_id;
            $redis->setex($key, $ttl, json_encode($user_data));
            return true;
        } catch(Exception $e) {
            return false;
        }
    }

    public function getSession($session_id) {
        try {
            $redis = $this->getConnection();
            $key = "session:" . $session_id;
            $data = $redis->get($key);
            return $data ? json_decode($data, true) : null;
        } catch(Exception $e) {
            return null;
        }
    }

    public function deleteSession($session_id) {
        try {
            $redis = $this->getConnection();
            $key = "session:" . $session_id;
            $redis->del($key);
            return true;
        } catch(Exception $e) {
            return false;
        }
    }
}
?>
