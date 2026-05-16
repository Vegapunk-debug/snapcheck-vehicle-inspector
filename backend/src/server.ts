import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
const PORT = 3000;
app.use(cors());

app.listen(PORT, () => console.log("listening"));
