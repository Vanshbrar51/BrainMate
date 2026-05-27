with open('rust-auth-gateway/src/db.rs', 'r') as f:
    text = f.read()

text = text.replace('.fetch_one(', '.persistent(false)\n        .fetch_one(')
text = text.replace('.fetch_optional(', '.persistent(false)\n        .fetch_optional(')
text = text.replace('.execute(', '.persistent(false)\n        .execute(')

with open('rust-auth-gateway/src/db.rs', 'w') as f:
    f.write(text)
