use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn hash_token_identifier(raw: &str) -> String {
    sha256_hex(raw)
}

pub fn hash_otp_with_pepper(otp: &str, pepper: &str) -> String {
    // Pepper is required to protect OTPs at rest if Redis is exposed.
    sha256_hex(&format!("{pepper}:{otp}"))
}

pub fn constant_time_eq(left: &str, right: &str) -> bool {
    let mut left_hasher = Sha256::new();
    left_hasher.update(left.as_bytes());
    let left_hash = left_hasher.finalize();

    let mut right_hasher = Sha256::new();
    right_hasher.update(right.as_bytes());
    let right_hash = right_hasher.finalize();

    // Comparing hashes of strings ensures that we do not leak the length of the string
    // through timing, as both strings are processed fully by the hasher.
    bool::from(left_hash.ct_eq(&right_hash))
}

#[cfg(test)]
mod tests {
    use super::{constant_time_eq, hash_token_identifier};

    #[test]
    fn hash_is_deterministic() {
        assert_eq!(hash_token_identifier("abc"), hash_token_identifier("abc"));
        assert_ne!(hash_token_identifier("abc"), hash_token_identifier("abcd"));
    }

    #[test]
    fn constant_time_eq_works() {
        assert!(constant_time_eq("abc", "abc"));
        assert!(!constant_time_eq("abc", "abx"));
        assert!(!constant_time_eq("abc", "abcd"));
    }
}
