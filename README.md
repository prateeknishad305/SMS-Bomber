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

