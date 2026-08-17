# Auth Testing Playbook

Step 1: MongoDB verification
```
mongosh
use test_database
db.users.find({role: "super_admin"}).pretty()
db.users.findOne({role: "super_admin"}, {password_hash: 1})
```
Verify: bcrypt hash starts with `$2b$`; unique index on users.email; TTL index on otps.expires_at; index on login_attempts.identifier.

Step 2: API testing
```
curl -c cookies.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"discussionunfiltered@gmail.com","password":"Sketch@2026"}'
cat cookies.txt
curl -b cookies.txt $API/api/auth/me
```
Login returns the user object and sets access_token + refresh_token httpOnly cookies. /me returns the same user via cookies.

Step 3: OTP flow
```
curl -X POST $API/api/auth/otp/request -H "Content-Type: application/json" -d '{"identifier":"otpuser@test.com"}'
# response contains dev_otp
curl -X POST $API/api/auth/otp/verify -H "Content-Type: application/json" -d '{"identifier":"otpuser@test.com","otp":"<dev_otp>","name":"OTP User"}'
```

Step 4: RBAC — customer token calling /api/admin/overview must return 403; admin token must return 200.
