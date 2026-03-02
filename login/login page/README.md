# User Authentication System - Internship Project

A complete user registration, login, and profile management system built with HTML, CSS, JavaScript (jQuery), PHP, MySQL, MongoDB, and Redis.

## Features

- ✅ User Registration with validation
- ✅ Secure Login with password hashing
- ✅ Profile Management (view and edit)
- ✅ Session Management using Redis
- ✅ LocalStorage for client-side session
- ✅ Responsive Bootstrap design
- ✅ jQuery AJAX for all backend communication
- ✅ MySQL prepared statements for security
- ✅ MongoDB for profile storage

## Tech Stack

- **Frontend**: HTML5, CSS3, Bootstrap 5, jQuery
- **Backend**: PHP 7.4+
- **Databases**: 
  - MySQL (user credentials)
  - MongoDB (user profiles)
  - Redis (session management)

## Project Structure

```
login page/
├── index.html              # Landing page
├── register.html           # Registration page
├── login.html             # Login page
├── profile.html           # Profile management page
├── css/
│   └── styles.css         # Custom styles
├── js/
│   ├── register.js        # Registration logic
│   ├── login.js          # Login logic
│   └── profile.js        # Profile management logic
├── php/
│   ├── config/
│   │   ├── database.php  # MySQL connection
│   │   ├── mongodb.php   # MongoDB connection
│   │   └── redis.php     # Redis connection
│   ├── register.php      # Registration endpoint
│   ├── login.php         # Login endpoint
│   ├── profile.php       # Profile CRUD endpoint
│   └── logout.php        # Logout endpoint
└── sql/
    └── init.sql          # MySQL table creation
```

## Prerequisites

Before running this project, ensure you have:

1. **Web Server**: Apache/Nginx with PHP support (XAMPP, WAMP, or LAMP)
2. **PHP**: Version 7.4 or higher
3. **MySQL**: Version 5.7 or higher
4. **MongoDB**: Version 4.0 or higher
5. **Redis**: Version 5.0 or higher

### PHP Extensions Required

- PDO
- PDO_MySQL
- MongoDB extension
- Redis extension

## Installation Steps

### 1. Install Required Software

#### Install XAMPP (Windows)
- Download from [https://www.apachefriends.org/](https://www.apachefriends.org/)
- Install and start Apache and MySQL services

#### Install MongoDB
- Download from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
- Install and start MongoDB service
- Install PHP MongoDB extension:
  ```bash
  pecl install mongodb
  ```
- Add to php.ini:
  ```
  extension=mongodb
  ```

#### Install Redis
- **Windows**: Download from [https://github.com/microsoftarchive/redis/releases](https://github.com/microsoftarchive/redis/releases)
- Install and start Redis service
- Install PHP Redis extension:
  ```bash
  pecl install redis
  ```
- Add to php.ini:
  ```
  extension=redis
  ```

### 2. Database Setup

#### MySQL Setup
1. Open phpMyAdmin or MySQL command line
2. Run the SQL script:
   ```bash
   mysql -u root -p < sql/init.sql
   ```
   Or manually execute the contents of `sql/init.sql`

#### MongoDB Setup
- MongoDB will automatically create the database and collection on first use
- No manual setup required

#### Redis Setup
- Redis will automatically handle session storage
- Default configuration is sufficient

### 3. Configuration

Update database credentials in configuration files if needed:

#### `php/config/database.php`
```php
private $host = "localhost";
private $db_name = "user_auth_system";
private $username = "root";
private $password = "";
```

#### `php/config/mongodb.php`
```php
private $host = "localhost";
private $port = "27017";
```

#### `php/config/redis.php`
```php
private $host = "127.0.0.1";
private $port = 6379;
```

### 4. Deploy Application

1. Copy the entire project folder to your web server's document root:
   - XAMPP: `C:\xampp\htdocs\login page\`
   - WAMP: `C:\wamp64\www\login page\`

2. Ensure proper permissions for PHP to read/write files

### 5. Access the Application

Open your browser and navigate to:
```
http://localhost/login page/
```

## Usage

### Registration Flow
1. Navigate to the registration page
2. Fill in username, email, and password
3. Submit the form
4. Account is created in MySQL and profile initialized in MongoDB
5. Redirect to login page

### Login Flow
1. Navigate to the login page
2. Enter username/email and password
3. Submit the form
4. Credentials verified against MySQL
5. Session created in Redis
6. Session ID stored in browser localStorage
7. Redirect to profile page

### Profile Management
1. After login, view your profile details
2. Update fields: age, date of birth, contact, address
3. Changes saved to MongoDB
4. Session validated via Redis on each request

### Logout
1. Click logout button
2. Session removed from Redis
3. LocalStorage cleared
4. Redirect to login page

## Security Features

- ✅ Password hashing using bcrypt
- ✅ Prepared statements to prevent SQL injection
- ✅ Input validation on client and server side
- ✅ Session management with Redis
- ✅ CORS headers configured
- ✅ XSS protection through proper escaping

## Testing Checklist

- [ ] Register a new user
- [ ] Verify user data in MySQL database
- [ ] Verify profile created in MongoDB
- [ ] Login with registered credentials
- [ ] Verify session in Redis
- [ ] Check localStorage for session_id
- [ ] Access profile page
- [ ] Update profile information
- [ ] Verify updates in MongoDB
- [ ] Logout and verify session cleared
- [ ] Try accessing profile without login (should redirect)

## Troubleshooting

### Common Issues

**Issue**: "Database connection failed"
- **Solution**: Check MySQL service is running and credentials are correct

**Issue**: "MongoDB connection failed"
- **Solution**: Ensure MongoDB service is running and extension is installed

**Issue**: "Redis connection failed"
- **Solution**: Start Redis service and verify extension is installed

**Issue**: "Class 'MongoDB\Driver\Manager' not found"
- **Solution**: Install MongoDB PHP extension via PECL

**Issue**: "Class 'Redis' not found"
- **Solution**: Install Redis PHP extension via PECL

### Verify PHP Extensions

Run this command to check installed extensions:
```bash
php -m
```

Look for:
- PDO
- pdo_mysql
- mongodb
- redis

## Requirements Compliance

✅ **Separate Files**: HTML, CSS, JS, and PHP in separate files  
✅ **jQuery AJAX**: All backend communication via AJAX  
✅ **Bootstrap**: Responsive form design  
✅ **MySQL**: User credentials with prepared statements  
✅ **MongoDB**: User profile storage  
✅ **Redis**: Session management  
✅ **LocalStorage**: Client-side session (no PHP sessions)  

## Project Submission

This project fulfills all requirements specified in the internship problem statement:
- Register → Login → Profile flow implemented
- All technologies used as required
- Security best practices followed
- Responsive design with Bootstrap
- Clean code structure

## Author

Created for Developer Internship Application

## License

This project is created for educational purposes.
