/**
 * Миграция ролей серверов
 * Конвертирует старые строковые роли в новую систему с ObjectId
 */

const mongoose = require('mongoose');
const Server = require('./models/Server');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';

async function migrateRoles() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    const servers = await Server.find({});
    console.log(`📊 Found ${servers.length} servers to migrate`);
    
    for (const server of servers) {
      let modified = false;
      
      // Создаем роль по умолчанию если ролей нет
      if (!server.roles || server.roles.length === 0) {
        server.roles = [{
          name: 'Участник',
          color: '#99aab5',
          permissions: {
            sendMessages: true,
            readMessages: true,
            connect: true,
            speak: true
          },
          position: 0
        }];
        modified = true;
      }
      
      // Получаем ID роли по умолчанию
      const defaultRoleId = server.roles[0]._id;
      
      // Обновляем роли участников
      for (const member of server.members) {
        // Если roles это массив строк или не массив ObjectId
        if (member.roles && Array.isArray(member.roles)) {
          const firstRole = member.roles[0];
          if (typeof firstRole === 'string' || (firstRole && typeof firstRole.toString === 'function' && !mongoose.Types.ObjectId.isValid(firstRole))) {
            // Заменяем на роль по умолчанию
            member.roles = [defaultRoleId];
            modified = true;
          }
        } else {
          // Если roles не массив, создаем пустой массив
          member.roles = [];
          modified = true;
        }
      }
      
      if (modified) {
        // Отключаем валидацию для миграции
        await Server.updateOne(
          { _id: server._id },
          { 
            $set: { 
              roles: server.roles,
              members: server.members 
            } 
          }
        );
        console.log(`✅ Migrated server: ${server.name}`);
      } else {
        console.log(`⏭️  Skipped server: ${server.name} (already migrated)`);
      }
    }
    
    console.log('✅ Migration completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateRoles();
