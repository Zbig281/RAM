const express = require('express');
const path = require('path');
const bodyParser = require('body-parser'); // Dodano import body-parser
const multer = require('multer');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Konfiguracja multer do obsługi przesyłania plików
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/Foto');
    },
    filename: function (req, file, cb) {
        // Unikalna nazwa pliku, aby uniknąć nadpisywania
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// Sprawdź i utwórz folder 'public/data', jeśli nie istnieje
const dataFolderPath = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(dataFolderPath)) {
    fs.mkdirSync(dataFolderPath);
}

// Endpoint dla zapisywania danych formularza w jednym pliku JSON
app.post('/submit', upload.array('photo', 20), (req, res) => {
    const formData = req.body;
    const photos = req.files.map(file => file.filename);

    // Unikalna nazwa pliku JSON
    const jsonFileName = 'data.json';
    const jsonFilePath = path.join(dataFolderPath, jsonFileName);

    // Odczytaj istniejące dane z pliku
    let existingData = {};
    try {
        const existingDataRaw = fs.readFileSync(jsonFilePath);
        existingData = JSON.parse(existingDataRaw);
    } catch (error) {
        console.error('Błąd podczas odczytu istniejącego pliku JSON:', error);
    }

    // Dodaj nowe dane do istniejących
    const newData = {
        formData: formData,
        photos: photos
    };

    existingData[Date.now()] = newData;

    // Zapisz dane z powrotem do pliku
    fs.writeFile(jsonFilePath, JSON.stringify(existingData, null, 2), (err) => {
        if (err) {
            console.error('Błąd podczas zapisywania pliku JSON:', err);
            res.status(500).send('Błąd podczas zapisywania pliku JSON');
        } else {
            console.log('Dane zapisane pomyślnie:', jsonFileName);
            res.send('Dane zapisane pomyślnie!');
        }
    });
});

// Endpoint dla usuwania danych (karty pracy) z listy.
app.delete('/delete/:timestamp', (req, res) => {
    const timestamp = req.params.timestamp;
    const jsonFileName = 'data.json';
    const jsonFilePath = path.join(dataFolderPath, jsonFileName);

    try {
        let existingData = JSON.parse(fs.readFileSync(jsonFilePath));

        // Pobierz zdjęcia powiązane z kartą pracy
        const photosToDelete = existingData[timestamp].photos || [];

        // Usuń kartę pracy
        delete existingData[timestamp];

        // Usuń pliki zdjęć powiązane z kartą pracy
        photosToDelete.forEach(photo => {
            const photoPath = path.join(__dirname, 'public', 'Foto', photo);
            fs.unlinkSync(photoPath);
        });

        // Zapisz zaktualizowane dane z powrotem do pliku JSON
        fs.writeFileSync(jsonFilePath, JSON.stringify(existingData, null, 2));

        res.send('Arbeitskarte wurde erfolgreich gelöscht!');
    } catch (error) {
        console.error('Fehler beim Löschen der Arbeitskarte:', error);
        res.status(500).send('Fehler beim Löschen der Arbeitskarte');
    }
});

// Endpoint do oznaczania karty pracy jako zakończonej
app.put('/complete/:timestamp', (req, res) => {
    const timestamp = req.params.timestamp;

    // Odczytaj aktualne dane z pliku JSON
    const filePath = path.join(__dirname, 'public', 'data', 'data.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Błąd odczytu pliku JSON:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }

        // Znajdź kartę do oznaczenia jako zakończona
        const jsonData = JSON.parse(data);
        const cardData = jsonData[timestamp];

        if (!cardData) {
            res.status(404).json({ error: 'Karta nie znaleziona' });
            return;
        }

        // Zaktualizuj dane karty
        cardData.formData.completed = true;

        // Zapisz zaktualizowane dane z powrotem do pliku JSON
        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Błąd zapisu pliku JSON:', err);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }

            res.json({ message: 'Dane zaktualizowane pomyślnie' });
        });
    });
});

// Endpoint do przywracania pracy do realizacji
app.post('/restore-in-progress/:timestamp', (req, res) => {
    const timestamp = req.params.timestamp;

    // Odczytaj aktualne dane z pliku JSON
    const filePath = path.join(__dirname, 'public', 'data', 'data.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Błąd odczytu pliku JSON:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Znajdź kartę do przywrócenia
        const jsonData = JSON.parse(data);
        if (!jsonData[timestamp]) {
            res.status(404).send('Karta nie znaleziona');
            return;
        }

        // Przywróć do realizacji
        jsonData[timestamp].formData.completed = false;

        // Zapisz zaktualizowane dane z powrotem do pliku JSON
        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Błąd zapisu pliku JSON:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            res.send('Praca przywrócona do realizacji pomyślnie');
        });
    });
});

// Endpoint do edycji karty pracy Edycja
app.put('/edit-comment/:timestamp', upload.array('editImage', 20), (req, res) => {
    const timestamp = req.params.timestamp;
    const updatedFields = req.body;
    const updatedImages = req.files.map(file => file.filename);

    // Odczytaj aktualne dane z pliku data.json
    const dataPath = 'public/data/data.json';
    let data = {};
    try {
        const rawData = fs.readFileSync(dataPath);
        data = JSON.parse(rawData);
    } catch (error) {
        console.error('Błąd odczytu pliku data.json:', error);
        res.status(500).send('Błąd odczytu danych.');
        return;
    }

    if (data[timestamp]) {
        // Zaktualizuj pola na podstawie przesłanych danych
        data[timestamp].formData = { ...data[timestamp].formData, ...updatedFields };

        // Dodaj nowe zdjęcia, jeśli są przesłane
        if (updatedImages.length > 0) {
            // Jeśli photos nie istnieje, stwórz nową tablicę
            data[timestamp].photos = data[timestamp].photos || [];

            // Dodaj nowe zdjęcia do tablicy
            data[timestamp].photos = data[timestamp].photos.concat(updatedImages);
        }

        // Zapisz zaktualizowane dane z powrotem do pliku data.json
        try {
            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
            res.send('Dane zostały zaktualizowane.');
        } catch (error) {
            console.error('Błąd zapisu pliku data.json:', error);
            res.status(500).send('Błąd zapisu danych.');
        }
    } else {
        res.status(404).send('Karta pracy nie znaleziona.');
    }
});




app.listen(port, () => {
    console.log(`Serwer uruchomiony na http://localhost:${port}`);
});
