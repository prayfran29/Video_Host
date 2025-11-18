const fs = require('fs');
const path = require('path');
const config = require('./config');

console.log('Testing series loading...');
console.log('Videos directory:', config.getVideosPath());

try {
    const videosDir = config.getVideosPath();
    
    if (!fs.existsSync(videosDir)) {
        console.error('❌ Videos directory does not exist:', videosDir);
        process.exit(1);
    }
    
    console.log('✓ Videos directory exists');
    
    const rootItems = fs.readdirSync(videosDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'Adult');
    
    console.log('Found directories:', rootItems.length);
    rootItems.forEach(item => console.log('  -', item.name));
    
    // Test first directory
    if (rootItems.length > 0) {
        const firstItem = rootItems[0];
        const itemPath = path.join(videosDir, firstItem.name);
        console.log('Testing first directory:', itemPath);
        
        const files = fs.readdirSync(itemPath);
        console.log('Files in first directory:', files.length);
        
        const videos = files.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
        console.log('Video files found:', videos.length);
    }
    
    console.log('✓ Series loading test completed successfully');
} catch (error) {
    console.error('❌ Error testing series loading:', error.message);
    console.error('Stack:', error.stack);
}