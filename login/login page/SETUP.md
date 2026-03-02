# Setup Guide - Quick Start

## Step 1: Install XAMPP
1. Download XAMPP from https://www.apachefriends.org/
2. Install and start Apache and MySQL

## Step 2: Install MongoDB
1. Download from https://www.mongodb.com/try/download/community
2. Install MongoDB Community Server
3. Start MongoDB service
4. Install PHP extension:
   ```bash
   pecl install mongodb
   ```
5. Add to php.ini: `extension=mongodb`

## Step 3: Install Redis
1. Download Redis for Windows from https://github.com/microsoftarchive/redis/releases
2. Install and start Redis service
3. Install PHP extension:
   ```bash
   pecl install redis
   ```
4. Add to php.ini: `extension=redis`

## Step 4: Setup Database
1. Open phpMyAdmin (http://localhost/phpmyadmin)
2. Import or run the SQL from `sql/init.sql`

## Step 5: Configure
1. Update database credentials in `php/config/database.php` if needed
2. Ensure MongoDB is running on port 27017
3. Ensure Redis is running on port 6379

## Step 6: Run
1. Place project in `C:\xampp\htdocs\login page\`
2. Open browser: http://localhost/login page/
3. Start testing!

## Quick Test
1. Register a new account
2. Login with credentials
3. Update your profile
4. Logout

## Verify Installation
Run in terminal:
```bash
php -m | findstr -i "pdo mongodb redis"
```

Should show:
- PDO
- pdo_mysql
- mongodb
- redis

## Need Help?
Check README.md for detailed troubleshooting.
