import express from "express";
import handlebars from "express-handlebars";
import mongoose from "mongoose";
import { Server } from "socket.io";
import ProductManager from "./DAO/productsDAO.js";
import MessagesManager from "./DAO/messagesDAO.js";
import cartRouter from "./routes/cart.routes.js";
import homeRouter from "./routes/home.routes.js";
import productsRouter from "./routes/products.routes.js";
import realTimeRoutes from "./routes/realTime.routes.js";
import messagesRouter from "./routes/messages.routes.js";
import sessionRouter from "./routes/session.routes.js";
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from "passport";
import initializePassport from "./config/passport.config.js";
import config from './config/config.js';

const app = express();

app.use(session({
    store: MongoStore.create({
        mongoUrl: config.mongoDb,
        mongoOptions: { useUnifiedTopology: true },
        ttl: 3600
    }),
    secret: config.secret,
    resave: false,
    saveUninitialized: false
}))
initializePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.engine(
    "handlebars",
    handlebars.engine({
        runtimeOptions: {
            allowProtoPropertiesByDefault: true,
            allowProtoMethodsByDefault: true,
        },
    })
);
app.set("views", "./src/views");
app.set("view engine", "handlebars");
app.use("/api/products", productsRouter);
app.use("/api/cart", cartRouter);
app.use("/", homeRouter);
app.use("/realtimeproducts", realTimeRoutes);
app.use("/chat", messagesRouter);
app.use("/api/session", sessionRouter)

const server = app.listen(8080, () =>
    console.log("Corriendo en el puerto: 8080")
);

mongoose.connect(
    config.mongoose,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    }
);

const db = mongoose.connection;

db.on("error", (error) => {
    console.error("Error de conexión:", error);
});

db.once("open", () => {
    console.log("Conexión exitosa a la base de datos.");
});

const io = new Server(server);
const manager = new ProductManager();
const managerMsg = new MessagesManager();
const message = [];

io.on("connection", async (socket) => {
    console.log("nuevo cliente conectado");
    const products = await manager.getProducts();
    io.emit("productList", products);
    socket.on("product", async (newProd) => {
        const result = await manager.addProduct(newProd);
        if (result.error) {
            socket.emit("productAddError", result.error);
        } else {
            const products = await manager.getProducts();
            io.emit("productList", products);
            socket.emit("productAddSuccess");
        }
    });

    socket.on("productDelete", async (delProduct) => {
        try {
            let pid = await manager.deleteProduct(delProduct);
            const products = await manager.getProducts();
            io.emit("productList", products);
        } catch (error) {
            socket.emit("productDeleteError", error.message);
        }
    });

    socket.on("messages", async (data) => {
        let msgSend;
        try {
            msgSend = await managerMsg.addMessage(data);
            message.unshift(data);
            io.emit("messageLogs", message);
        } catch (error) {
            throw error;
        }
    });
});