-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isSupremeAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isTester" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "avatarUrl" TEXT DEFAULT 'https://i.imgur.com/DCp3Qe0.png',
    "robloxUsername" TEXT,
    "discordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "banDetails" JSONB,
    "recoveryToken" TEXT,
    "recoveryTokenExpires" TIMESTAMP(3),
    "securityQuestion" TEXT,
    "securityAnswerHash" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RPG" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "xpToNextLevel" INTEGER NOT NULL DEFAULT 100,
    "coins" INTEGER NOT NULL DEFAULT 10,
    "godMode" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "characters" TEXT NOT NULL DEFAULT '[]',
    "inventory" TEXT NOT NULL DEFAULT '[]',
    "pets" TEXT NOT NULL DEFAULT '[]',
    "equippedWeapon" TEXT,

    CONSTRAINT "RPG_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "public"."User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "RPG_userId_key" ON "public"."RPG"("userId");

-- AddForeignKey
ALTER TABLE "public"."RPG" ADD CONSTRAINT "RPG_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
