use anyhow::{Context, Result};
use rusqlite::params;
use std::sync::Mutex;

use crate::{Role, User};

pub struct UserDb {
    conn: Mutex<rusqlite::Connection>,
}

impl UserDb {
    pub fn new(path: &str) -> Result<Self> {
        let conn = if path == ":memory:" {
            rusqlite::Connection::open_in_memory()
        } else {
            rusqlite::Connection::open(path)
        }
        .context("Failed to open user database")?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created TEXT NOT NULL
            )",
        )
        .context("Failed to create users table")?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn create_user(&self, username: &str, password: &str, role: Role) -> Result<User> {
        let user = User::new(
            uuid::Uuid::new_v4().to_string(),
            username.to_string(),
            password,
            role,
        )?;

        let role_str = serde_json::to_string(&user.role)?;
        let created = chrono::Utc::now().to_rfc3339();

        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        conn.execute(
            "INSERT INTO users (id, username, password_hash, role, created) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![user.id, user.username, user.password_hash, role_str, created],
        ).context("Failed to insert user")?;

        Ok(user)
    }

    pub fn get_by_username(&self, username: &str) -> Result<Option<User>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, username, password_hash, role FROM users WHERE username = ?1",
        )?;

        let result = stmt.query_row(params![username], |row| {
            let id: String = row.get(0)?;
            let username: String = row.get(1)?;
            let password_hash: String = row.get(2)?;
            let role_str: String = row.get(3)?;
            Ok((id, username, password_hash, role_str))
        });

        match result {
            Ok((id, username, password_hash, role_str)) => {
                let role: Role = serde_json::from_str(&role_str)
                    .unwrap_or(Role::Viewer);
                Ok(Some(User {
                    id,
                    username,
                    password_hash,
                    role,
                }))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<User>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, username, password_hash, role FROM users WHERE id = ?1",
        )?;

        let result = stmt.query_row(params![id], |row| {
            let id: String = row.get(0)?;
            let username: String = row.get(1)?;
            let password_hash: String = row.get(2)?;
            let role_str: String = row.get(3)?;
            Ok((id, username, password_hash, role_str))
        });

        match result {
            Ok((id, username, password_hash, role_str)) => {
                let role: Role = serde_json::from_str(&role_str)
                    .unwrap_or(Role::Viewer);
                Ok(Some(User {
                    id,
                    username,
                    password_hash,
                    role,
                }))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn list_users(&self) -> Result<Vec<UserInfo>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let mut stmt = conn.prepare("SELECT id, username, role, created FROM users")?;

        let users = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let username: String = row.get(1)?;
                let role_str: String = row.get(2)?;
                let created: String = row.get(3)?;
                Ok((id, username, role_str, created))
            })?
            .filter_map(|r| r.ok())
            .map(|(id, username, role_str, created)| {
                let role: Role = serde_json::from_str(&role_str).unwrap_or(Role::Viewer);
                UserInfo {
                    id,
                    username,
                    role,
                    created,
                }
            })
            .collect();

        Ok(users)
    }

    pub fn delete_user(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let rows = conn.execute("DELETE FROM users WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    pub fn count_users(&self) -> Result<usize> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    pub fn seed_admin(&self, password: &str) -> Result<Option<User>> {
        if self.count_users()? == 0 {
            let user = self.create_user("admin", password, Role::Admin)?;
            tracing::info!("Created default admin user");
            Ok(Some(user))
        } else {
            Ok(None)
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub role: Role,
    pub created: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> UserDb {
        UserDb::new(":memory:").unwrap()
    }

    #[test]
    fn test_create_and_get_user() {
        let db = test_db();
        let user = db.create_user("alice", "password123", Role::User).unwrap();
        assert_eq!(user.username, "alice");
        assert_eq!(user.role, Role::User);

        let found = db.get_by_username("alice").unwrap().unwrap();
        assert_eq!(found.id, user.id);
        assert_eq!(found.username, "alice");

        let found_by_id = db.get_by_id(&user.id).unwrap().unwrap();
        assert_eq!(found_by_id.username, "alice");
    }

    #[test]
    fn test_duplicate_username() {
        let db = test_db();
        db.create_user("alice", "pass1", Role::User).unwrap();
        let result = db.create_user("alice", "pass2", Role::Admin);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_nonexistent_user() {
        let db = test_db();
        assert!(db.get_by_username("nobody").unwrap().is_none());
        assert!(db.get_by_id("no-such-id").unwrap().is_none());
    }

    #[test]
    fn test_list_users() {
        let db = test_db();
        db.create_user("alice", "pass1", Role::Admin).unwrap();
        db.create_user("bob", "pass2", Role::User).unwrap();

        let users = db.list_users().unwrap();
        assert_eq!(users.len(), 2);
    }

    #[test]
    fn test_delete_user() {
        let db = test_db();
        let user = db.create_user("alice", "pass1", Role::User).unwrap();
        assert!(db.delete_user(&user.id).unwrap());
        assert!(db.get_by_id(&user.id).unwrap().is_none());
        assert!(!db.delete_user("no-such-id").unwrap());
    }

    #[test]
    fn test_count_users() {
        let db = test_db();
        assert_eq!(db.count_users().unwrap(), 0);
        db.create_user("alice", "pass1", Role::User).unwrap();
        assert_eq!(db.count_users().unwrap(), 1);
    }

    #[test]
    fn test_seed_admin() {
        let db = test_db();
        let admin = db.seed_admin("admin123").unwrap();
        assert!(admin.is_some());
        let admin = admin.unwrap();
        assert_eq!(admin.username, "admin");
        assert_eq!(admin.role, Role::Admin);

        // Second seed should be a no-op
        let second = db.seed_admin("admin123").unwrap();
        assert!(second.is_none());
    }

    #[test]
    fn test_password_verification() {
        let db = test_db();
        db.create_user("alice", "secret", Role::User).unwrap();
        let user = db.get_by_username("alice").unwrap().unwrap();
        assert!(user.verify_password("secret").unwrap());
        assert!(!user.verify_password("wrong").unwrap());
    }
}
