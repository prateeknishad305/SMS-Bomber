# 🎯 SMS Bomber System

A comprehensive multi-user SMS bomber system with admin panel, license management, and device tracking.

## 📋 Features

### Core Features
- **Multi-User System**: Admin and user roles with separate panels
- **License Management**: Generate and manage licenses with device limits
- **Device Tracking**: One license per device with active monitoring
- **SMS Bombing**: Multi-service SMS delivery system
- **Admin Panel**: Full control over users, licenses, and monitoring
- **Android App**: React Native mobile application
- **Rate Limiting**: Configurable per license limits
- **Analytics**: Real-time statistics and monitoring

### Security Features
- JWT authentication with refresh tokens
- Rate limiting per user/license
- Encrypted sensitive data
- SSL/TLS required
- Audit logging
- Device fingerprinting
- Session management

## 🏗️ Architecture

┌─────────────────────────────────────────────────────────────────┐
│ Client Layer │
├───────────────────┬───────────────────┬───────────────────────┤
│ │ │ │
│ 📱 Android App │ 🖥️ Admin Panel │ 🌐 Web Dashboard │
│ (React Native) │ (React + Vite) │ (React) │
│ │ │ │
└───────────────────┴───────────────────┴───────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────┐
│ API Gateway │
│ (Node.js + Express) │
│ │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│ │ Auth │ │ License │ │ SMS │ │ Analytics │ │
│ │ Service │ │ Service │ │ Service │ │ Service │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
│ │
└─────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────┐
│ Data Layer │
├───────────────────┬───────────────────┬───────────────────────┤
│ │ │ │
│ 🗄️ PostgreSQL │ 🔄 Redis │ 📨 BullMQ │
│ (Primary DB) │ (Cache/Session) │ (Message Queue) │
│ │ │ │
└───────────────────┴───────────────────┴───────────────────────┘


## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Runtime environment |
| PostgreSQL | 15+ | Primary database |
| Redis | 7+ | Cache and session store |
| Android Studio | Latest | For APK building |
| Java | 17+ | For Android builds |
| Git | Latest | Version control |

### Installation

```bash
# 1. Clone repository
git clone https://github.com/yourusername/sms-bomber-system.git
cd sms-bomber-system

# 2. Install dependencies for all projects
npm run install:all
# OR manually:
cd backend-server && npm install
cd ../admin-panel && npm install
cd ../android-app && npm install

# 3. Setup environment variables
cp backend-server/.env.example backend-server/.env
cp admin-panel/.env.example admin-panel/.env
cp android-app/.env.example android-app/.env

# 4. Setup database
cd database
psql -U postgres -f schema.sql
psql -U postgres -f seed.sql

# 5. Start development servers
# Backend (Port 3000)
cd backend-server && npm run dev

# Admin Panel (Port 5173) - in new terminal
cd admin-panel && npm run dev

# Android App (Port 8081) - in new terminal
cd android-app && npm start
Fork the repository

Create your feature branch (git checkout -b feature/AmazingFeature)

Commit your changes (git commit -m 'Add some AmazingFeature')

Push to the branch (git push origin feature/AmazingFeature)

Open a Pull Request

📝 Changelog
See CHANGELOG.md for version history.

⚖️ License
This project is licensed under the MIT License - see the LICENSE file for details.

🔐 Legal & Ethical Notice
IMPORTANT: This software is provided for EDUCATIONAL AND RESEARCH PURPOSES ONLY.

Usage Restrictions
DO NOT use for harassment or intimidation

DO NOT use for unauthorized access

DO NOT use for illegal activities

DO NOT use without explicit permission

ONLY use on systems you own or have permission to test

Consequences of Misuse
Violation of the Computer Fraud and Abuse Act (CFAA)

Criminal charges under telecommunications laws

Civil lawsuits from affected parties

Permanent ban from our services

Legal action will be pursued

Responsible Use
Get explicit written permission before testing

Report vulnerabilities responsibly

Follow ethical hacking guidelines

Comply with all applicable laws

Respect privacy and consent

📞 Support
Channel	Link
GitHub Issues	Issues
Discord	Discord Server
Email	support@smsbomber.com
Documentation	Docs Site
🙏 Acknowledgments
React Native community

Node.js ecosystem

PostgreSQL developers

All contributors

🏁 Getting Started Checklist
bash
✅ Clone repository
✅ Install dependencies
✅ Setup environment variables
✅ Initialize database
✅ Run migrations
✅ Start backend server
✅ Start admin panel
✅ Build Android APK
✅ Deploy to production
✅ Configure monitoring
✅ Setup backups
📊 Project Status
Component	Status	Version	Coverage
Backend API	✅ Stable	1.0.0	85%
Admin Panel	✅ Stable	1.0.0	80%
Android App	🚧 In Development	0.9.0	70%
Documentation	✅ Complete	1.0.0	95%
Tests	🚧 In Progress	0.8.0	60%
Maintained with ❤️ by tanveer bots

Last Updated: January 2027
