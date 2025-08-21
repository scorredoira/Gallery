const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let lastUsedPath = null;
let currentVideoPath = null;
let galleryPath = null; // Separar la ruta de galería
let currentVideoFilePath = null;
let frameCounter = {};

// Cargar configuración guardada
function loadConfig() {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            lastUsedPath = config.lastUsedPath;
            galleryPath = config.galleryPath; // Recordar carpeta de galería
            console.log('Config loaded, galleryPath:', galleryPath); // Debug
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
}

// Guardar configuración
function saveConfig() {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    try {
        const config = { lastUsedPath };
        if (galleryPath) {
            config.galleryPath = galleryPath;
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('Config saved with galleryPath:', galleryPath); // Debug
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'default',
        minWidth: 800,
        minHeight: 600
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Mantener aspect ratio al redimensionar
    mainWindow.on('resize', () => {
        mainWindow.webContents.send('window-resized');
    });
}

app.whenReady().then(() => {
    loadConfig();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    app.quit();
});

// IPC handlers para diálogo de archivos
ipcMain.handle('open-file-dialog', async () => {
    const options = {
        properties: ['openFile'],
        filters: [
            { name: 'Videos', extensions: ['mov', 'mp4', 'avi', 'webm', 'mkv'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    };
    
    // Solo agregar defaultPath si existe y es válido
    if (lastUsedPath && typeof lastUsedPath === 'string') {
        options.defaultPath = lastUsedPath;
    }
    
    const result = await dialog.showOpenDialog(mainWindow, options);

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        currentVideoPath = path.dirname(filePath);  // Guardar la carpeta del video actual
        currentVideoFilePath = filePath;  // Guardar la ruta completa del video
        lastUsedPath = currentVideoPath;
        saveConfig();
        
        // Resetear contador para nueva sesión
        const today = new Date();
        const day = today.getDate().toString().padStart(2, '0');
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const year = today.getFullYear();
        const dateFolder = `${day}-${month}-${year}`;
        
        // Resetear contador al cargar nuevo video
        frameCounter[dateFolder] = 0;
        
        // Si no hay galleryPath configurado, usar la carpeta del video actual como fallback
        if (!galleryPath) {
            galleryPath = currentVideoPath;
            saveConfig();
        }
        
        console.log('Video loaded, currentVideoPath:', currentVideoPath, 'galleryPath:', galleryPath); // Debug
        
        // Leer el archivo y enviarlo como buffer
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        
        return {
            buffer: fileBuffer,
            name: fileName,
            path: filePath
        };
    }
    
    return null;
});

// IPC handler para guardar archivo
ipcMain.handle('save-file-dialog', async (event, defaultName) => {
    const options = {
        filters: [
            { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
        ]
    };
    
    // Usar la carpeta del video actual primero, si no, la última usada
    const savePath = currentVideoPath || lastUsedPath;
    
    if (savePath && typeof savePath === 'string') {
        options.defaultPath = path.join(savePath, defaultName);
    } else {
        options.defaultPath = defaultName;
    }
    
    const result = await dialog.showSaveDialog(mainWindow, options);

    if (!result.canceled) {
        // No actualizar lastUsedPath al guardar, mantener la del video
        return result.filePath;
    }
    
    return null;
});

// IPC handler para guardar el archivo
ipcMain.handle('save-file', async (event, filePath, buffer) => {
    try {
        fs.writeFileSync(filePath, Buffer.from(buffer));
        return true;
    } catch (error) {
        console.error('Error saving file:', error);
        return false;
    }
});

// IPC handler para guardado rápido sin diálogo
ipcMain.handle('quick-save', async (event, buffer, notes = '') => {
    if (!currentVideoFilePath) {
        return { success: false, error: 'No video loaded' };
    }
    
    try {
        const today = new Date();
        const day = today.getDate().toString().padStart(2, '0');
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const year = today.getFullYear();
        const dateFolder = `${day}-${month}-${year}`;
        
        const outputDir = path.join(currentVideoPath, dateFolder);
        
        // Crear carpeta si no existe
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Incrementar contador para esta fecha
        if (!frameCounter[dateFolder]) {
            frameCounter[dateFolder] = 0;
        }
        frameCounter[dateFolder] = frameCounter[dateFolder] + 1;
        
        // Guardar archivo con nombre secuencial
        const outputPath = path.join(outputDir, `${frameCounter[dateFolder]}.jpg`);
        fs.writeFileSync(outputPath, Buffer.from(buffer));
        
        // Guardar notas en archivo txt si hay contenido
        if (notes && notes.trim()) {
            const notesPath = path.join(outputDir, 'notas.txt');
            fs.writeFileSync(notesPath, notes.trim(), 'utf8');
        }
        
        return { 
            success: true, 
            path: outputPath,
            number: frameCounter[dateFolder],
            folder: dateFolder
        };
    } catch (error) {
        console.error('Error in quick save:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler para borrar video original
ipcMain.handle('delete-original-video', async () => {
    if (!currentVideoFilePath) {
        return { success: false, error: 'No video loaded' };
    }
    
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Cancelar', 'Borrar'],
        defaultId: 0,
        message: 'Borrar video original',
        detail: `¿Estás seguro de que quieres borrar el archivo:\n${path.basename(currentVideoFilePath)}?`
    });
    
    if (result.response === 1) {
        try {
            fs.unlinkSync(currentVideoFilePath);
            currentVideoFilePath = null;
            currentVideoPath = null;
            return { success: true };
        } catch (error) {
            console.error('Error deleting file:', error);
            return { success: false, error: error.message };
        }
    }
    
    return { success: false, error: 'Cancelled' };
});

// IPC handler para abrir galería
ipcMain.handle('open-gallery', async (event, customPath) => {
    try {
        const basePath = customPath || galleryPath || currentVideoPath;
        console.log('Opening gallery with path:', basePath, 'galleryPath:', galleryPath, 'currentVideoPath:', currentVideoPath); // Debug
        if (!basePath || !fs.existsSync(basePath)) {
            return { success: false, error: 'No hay carpeta de videos configurada' };
        }

        // Leer todas las carpetas que coincidan con formato de fecha
        const folders = fs.readdirSync(basePath)
            .filter(item => {
                const fullPath = path.join(basePath, item);
                const isDir = fs.statSync(fullPath).isDirectory();
                const matchesDateFormat = /^\d{2}-\d{2}-\d{4}$/.test(item);
                return isDir && matchesDateFormat;
            })
            .sort((a, b) => {
                // Ordenar por fecha más reciente primero
                const dateA = new Date(a.split('-').reverse().join('-'));
                const dateB = new Date(b.split('-').reverse().join('-'));
                return dateB - dateA;
            });

        const galleryData = [];

        for (const folder of folders) {
            const folderPath = path.join(basePath, folder);
            
            // Leer archivos de imagen
            const images = fs.readdirSync(folderPath)
                .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
                .sort((a, b) => {
                    // Ordenar por número (1.jpg, 2.jpg, etc.)
                    const numA = parseInt(a.split('.')[0]);
                    const numB = parseInt(b.split('.')[0]);
                    return numA - numB;
                });

            if (images.length > 0) {
                // Leer notas si existen
                const notesPath = path.join(folderPath, 'notas.txt');
                let notes = '';
                if (fs.existsSync(notesPath)) {
                    try {
                        notes = fs.readFileSync(notesPath, 'utf8');
                    } catch (e) {
                        notes = '';
                    }
                }

                galleryData.push({
                    folder,
                    folderPath,
                    images: images.map(img => path.join(folderPath, img)),
                    count: images.length,
                    notes
                });
            }
        }

        return { success: true, data: galleryData, basePath };
    } catch (error) {
        console.error('Error opening gallery:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler para seleccionar directorio de galería
ipcMain.handle('select-gallery-directory', async () => {
    const options = {
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta de galería'
    };
    
    // Solo agregar defaultPath si existe y es válido
    if (lastUsedPath && typeof lastUsedPath === 'string') {
        options.defaultPath = lastUsedPath;
    }
    
    const result = await dialog.showOpenDialog(mainWindow, options);

    if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        // Actualizar la carpeta de galería y guardar
        galleryPath = selectedPath;
        saveConfig();
        return { success: true, path: selectedPath };
    }
    
    return { success: false };
});

// IPC handler para leer imagen como base64
ipcMain.handle('read-image-as-base64', async (event, imagePath) => {
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64 = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        return { success: true, data: `data:${mimeType};base64,${base64}` };
    } catch (error) {
        console.error('Error reading image:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler para guardar área de recorte
ipcMain.handle('save-crop-area', async (event, cropArea) => {
    const cropConfigPath = path.join(app.getPath('userData'), 'crop-config.json');
    try {
        fs.writeFileSync(cropConfigPath, JSON.stringify(cropArea, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error saving crop area:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler para cargar área de recorte
ipcMain.handle('load-crop-area', async () => {
    const cropConfigPath = path.join(app.getPath('userData'), 'crop-config.json');
    try {
        if (fs.existsSync(cropConfigPath)) {
            const cropArea = JSON.parse(fs.readFileSync(cropConfigPath, 'utf8'));
            return { success: true, data: cropArea };
        }
        return { success: false, error: 'No crop area saved' };
    } catch (error) {
        console.error('Error loading crop area:', error);
        return { success: false, error: error.message };
    }
});