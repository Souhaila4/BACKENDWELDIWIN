/**
 * Cleanup Script: Delete Orphaned Rooms and Messages
 * 
 * This script finds and deletes rooms and messages for children that no longer exist.
 * Run this script to clean up orphaned data from previously deleted children.
 * 
 * Usage:
 *   npm run cleanup:orphaned-rooms
 * 
 * Or directly:
 *   npx ts-node -r tsconfig-paths/register scripts/cleanup-orphaned-rooms.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

async function cleanupOrphanedRooms() {
  console.log('🚀 Starting cleanup of orphaned rooms and messages...\n');

  try {
    // Create NestJS application context to access database connection
    const app = await NestFactory.createApplicationContext(AppModule);
    const connection = app.get<Connection>(getConnectionToken());

    // Get collections directly
    const roomCollection = connection.collection('rooms');
    const messageCollection = connection.collection('messages');
    const childCollection = connection.collection('children');

    // Step 1: Find all rooms
    const allRooms = await roomCollection.find({}).toArray();
    console.log(`📊 Found ${allRooms.length} total rooms`);

    if (allRooms.length === 0) {
      console.log('✅ No rooms found. Database is clean!');
      await app.close();
      process.exit(0);
    }

    // Step 2: Find orphaned rooms (rooms where child doesn't exist)
    const orphanedRooms: any[] = [];
    const childIds = new Set<string>();

    for (const room of allRooms) {
      const childId = room.child?.toString();
      if (childId) {
        childIds.add(childId);
      }
    }

    // Check which children exist
    const existingChildren = await childCollection.find({
      _id: { $in: Array.from(childIds).map(id => id as any) }
    }).project({ _id: 1 }).toArray();

    const existingChildIds = new Set(
      existingChildren.map(child => child._id.toString())
    );

    // Find orphaned rooms
    for (const room of allRooms) {
      const childId = room.child?.toString();
      if (childId && !existingChildIds.has(childId)) {
        orphanedRooms.push(room);
      }
    }

    console.log(`🔍 Found ${orphanedRooms.length} orphaned rooms (rooms with deleted children)\n`);

    if (orphanedRooms.length === 0) {
      console.log('✅ No orphaned rooms found. Database is clean!');
      await app.close();
      process.exit(0);
    }

    // Step 3: Delete messages in orphaned rooms
    const orphanedRoomIds = orphanedRooms.map(room => room._id);
    const messagesResult = await messageCollection.deleteMany({
      room: { $in: orphanedRoomIds }
    });
    console.log(`🗑️  Deleted ${messagesResult.deletedCount} messages from orphaned rooms`);

    // Step 4: Delete orphaned rooms
    const roomsResult = await roomCollection.deleteMany({
      _id: { $in: orphanedRoomIds }
    });
    console.log(`🗑️  Deleted ${roomsResult.deletedCount} orphaned rooms\n`);

    // Summary
    console.log('📋 Cleanup Summary:');
    console.log(`   - Orphaned rooms found: ${orphanedRooms.length}`);
    console.log(`   - Messages deleted: ${messagesResult.deletedCount}`);
    console.log(`   - Rooms deleted: ${roomsResult.deletedCount}`);
    console.log('\n✅ Cleanup completed successfully!');

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupOrphanedRooms();

