import express from 'express';
import path from 'path';
const app = express();
const port = process.env.PORT || 8080;

// Servire i file statici dalla cartella "dist"
app.use(express.static(path.join(__dirname, 'dist')));

// Rispondere con index.html per ogni altra richiesta (React Router)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});