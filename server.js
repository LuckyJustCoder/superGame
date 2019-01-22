const path = require('path');
const express = require('express');
const session = require('express-session');
const app = express();
const mysql = require('mysql');
const cookieParser = require('cookie-parser');
const sha256 = require('js-sha256');
const http = require('http').Server(app);
const helmet = require('helmet');
const config = require('./config.json');

app.use(helmet());
app.disable('x-powered-by');
app.use(require("body-parser").json());
app.use(express.static('public'));
app.use(cookieParser());
app.use(function(req, res, next) {res.header("Access-Control-Allow-Origin", "*");res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");next();});
app.use(session({secret: 'keyboard cat', cookie: { maxAge: 60000 }, resave: false, saveUninitialized: true}));
app.get('/', function(req, res) {res.sendFile(path.join(__dirname + '/index.html'));});

app.get('/settings', function(request, response) {
    let login = request.cookies['login'];
    let session = request.cookies['session'];
    con.query(`SELECT * FROM users WHERE login = ?`,[login], function (error, result) {
        try{
            if(error){
                response.sendFile(path.join(__dirname + '/index.html'));
                return false;
            }
            if(result[0].login !== login || result[0].session !== session){
                res.sendFile(path.join(__dirname + '/index.html'));
                return false;
            }
            response.sendFile(path.join(__dirname + '/public/settings.html'));
        }catch (e) {
            response.sendFile(path.join(__dirname + '/index.html'));
            return false;
        }
    });
});

let con = mysql.createConnection({
    host: config.Game.DataBase.host,
    user: config.Game.DataBase.user,
    password: config.Game.DataBase.password,
    database: config.Game.DataBase.database
});

con.connect(function(err) {
    if (err) throw err;
    console.log("[DB] => Connected");

    http.listen(config.Game.Server.port, function(){
        console.log(`listening on *:${config.Game.Server.port}`);
    });
});

function createCode(){

    let code = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++){
        code +=  possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return sha256(code);
}

app.post('/api/logout', function(request, response) {

    let login = request.cookies['login'];

    con.query(`SELECT * FROM users WHERE login = ?`,[login], function (error, result) {
        try {
            if(error){
                response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: error.code}));
                return false;
            }

            new Promise(function (resolve) {
                let code = "null";
                con.query(`UPDATE users SET session = '${code}' WHERE (login = '${login}')`, function(error){
                    if(error){
                        response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                        return false;
                    }
                    resolve(1);
                });
            }).then(function () {
                new Promise(function (resolve) {
                    addCookie(response, "login", login);
                    addCookie(response, "session", "0");
                    resolve(1);
                }).then(function () {
                    response.send(JSON.stringify({body:result[0], code: 200}));
                    return false;
                });
            });
        }catch(e) {
            response.send(JSON.stringify({body:"true", code: 200}));
            return false;
        }
    });
});

app.post('/api/autoAuth', (request, response) => {

    let login = request.cookies['login'];
    let session = request.cookies['session'];

    con.query(`SELECT * FROM users WHERE login = ?`,[login], function (error, result) {
        try {
            if(error){
                response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: error.code}));
                return false;
            }
            if(result[0].login !== login || result[0].session !== session){
                response.send(JSON.stringify({body: `Ошибка: Авторизуйтесь`, code: 400}));
                return false;
            }

            let code = createCode();
            new Promise(function (resolve) {
                con.query(`UPDATE users SET session = '${code}' WHERE (login = '${login}')`, function(error){
                    if(error){
                        response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                        return false;
                    }
                    resolve(1);
                });
            }).then(function () {
                new Promise(function (resolve) {
                    addCookie(response, "login", login);
                    addCookie(response, "session", code);
                    resolve(1);
                }).then(function () {
                    response.send(JSON.stringify({body:result[0], code: 200}));
                    return false;
                });
            });
        }catch(e) {
            response.send(JSON.stringify({body: `Ошибка: ${e.name} => ${e.message}`, code: 500}));
            return false;
        }
    });
});

app.post('/api/registration', (request, response) => {

    if(request.body.password.length === 0) {
        response.send(JSON.stringify({body: `Ошибка: Пароль слишком короткий.`, code: 400}));
        return true;
    }

    if(!/^[a-zA-Z0-9\s]+$/.test(request.body.login)){
        response.send(JSON.stringify({body: `Ошибка: Логин содержит запрещённые символы.`, code: 400}));
        return true;
    }

    if(!/^[a-zA-Z0-9\s]+$/.test(request.body.password)){
        response.send(JSON.stringify({body: `Ошибка: Пароль содержит запрещённые символы.`, code: 400}));
        return true;
    }

    con.query(`SELECT * FROM users WHERE login = ?`, [request.body.login], function (error, result) {
        try{
            if(error){
                response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                return true;
            }
            if(result.length > 0){
                response.send(JSON.stringify({body: `Ошибка => пользователь ${request.body.login} зарегестрирован.`, code: 400}));
                return true;
            }
            if (request.body.password.length > 3 && request.body.password.length < 25) {

                con.query(`INSERT INTO users SET ?`,{login: request.body.login, name: request.body.login, password: sha256(request.body.password), coins: 0}, function (error) {
                    if (error) {
                        response.send(JSON.stringify({
                            body: `Ошибка: ${error.code} => ${error.sqlMessage}`,
                            code: 500
                        }));
                        return true;
                    }
                    con.query(`SELECT * FROM users WHERE login = ?`, [request.body.login],function (error, result) {
                        new Promise(function (resolve) {
                            let code = createCode();

                            if(request.body.autojoin){
                                con.query(`UPDATE users SET session = ? WHERE ('login' = ?)`, [code, result[0].login],function(){
                                    addCookie(response, "session", code);
                                    resolve(1);
                                });
                            }else{
                                resolve(1);
                            }
                        }).then(function() {
                            addCookie(response, "login", result[0].login);

                            response.send(JSON.stringify({body:result[0], code: 200}));
                            return true;
                        });
                    });
                });
            }else{
                response.send(JSON.stringify({body: `Ошибка: Пароль не может быть меньше 4 сиволов и привышать 20.`, code: 400}));
                return true;
            }
        }catch (e) {
            response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
            return true;
        }
    });
});

app.post('/api/login', (request, response) => {

    con.query(`SELECT * FROM users WHERE login = ?`, [request.body.login], function (error, result) {
        try {
            if(error){
                response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                return false;
            }
            if(result.length === 0){
                response.send(JSON.stringify({body: `Ошибка: Пользователь ${request.body.login}, не зарегистрирован.`, code: 404}));
                return false;
            }
            if(result[0].password !== sha256(request.body.password)){
                response.send(JSON.stringify({body: "Ошибка: Логин или пароль не верный!", code: 400}));
                return false;
            }

            new Promise(function (resolve) {
                let code = createCode();

                if(request.body.autojoin){
                    con.query(`UPDATE users SET session = '${code}' WHERE (login = '${result[0].login}')`, function(error){
                        if(error){
                            response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                            return false;
                        }
                        addCookie(response, "session", code);
                        resolve(1);
                    });
                }else{
                    resolve(1);
                }
            }).then(function() {
                addCookie(response, "login", result[0].login);

                response.send(JSON.stringify({body:result[0], code: 200}));
                return true;
            });
        }catch(e) {
            response.send(JSON.stringify({body: `Ошибка: ${e.name} => ${e.message}`, code: 500}));
            return true;
        }
    });
});

app.post('/api/changedata', (request, response) => {

    const login = request.cookies['login'];
    con.query(`SELECT * FROM users WHERE login = ?`,[login], function (error, result) {

        try {
            if(error){
                response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                return false;
            }else if(result[0].password !== sha256(request.body.passwordold)){
                response.send(JSON.stringify({body: `Ошибка: Пароль не верный!`, code: 400}));
                return false;
            }else if(result.length === 0){
                response.send(JSON.stringify({body: `Ошибка: перезайдите в аккаунт!`, code: 400}));
                return false;
            }else{
                let name = request.body.name.replace(/</, "&#60");
                name = name.replace(/>/, "&#62");

                if(name.length <= 20){
                    con.query(`UPDATE users SET 'name' = ? WHERE ('login' = ?)`,[name, login],function(){
                        if(error){
                            response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: error.code}));
                            return false;
                        }
                    });
                }else{
                    response.send(JSON.stringify({body: `Ошибка: Длинна имени не может привышать 20'и букв.`, code: 400}));
                    return false;
                }

                if(/^[a-z 1-9\s]+$/.test(request.body.login) && request.body.login.length < 20){
                    con.query("UPDATE users SET `login` = ? WHERE ('login' = ?)",[request.body.login, login],function(){
                        if(error){
                            response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                            return false;
                        }
                    });
                }else{
                    response.send(JSON.stringify({body: `Ошибка: Длинна логина не может привышать 20'и букв.`, code: 400}));
                    return false;
                }

                if(request.body.password.length > 0){

                    let pass = request.body.password.replace(/</, "&#60");
                    pass = pass.replace(/>/, "&#62");

                    if(pass.length > 3 && pass.length < 20){
                        con.query("UPDATE users SET `password` = ? WHERE ('login' = ?)",[sha256(request.body.password), login],function(){
                            if(error){
                                response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                                return false;
                            }
                        });
                    }else{
                        response.send(JSON.stringify({body: `Ошибка: Длинна логина не может привышать 20'и букв.`, code: 400}));
                        return false;
                    }
                }

                con.query("SELECT * FROM users WHERE login = ?", [request.body.login], function (error, result) {
                    if(error){
                        response.send(JSON.stringify({body: `Ошибка: ${error.code} => ${error.sqlMessage}`, code: 500}));
                        return false;
                    }
                    addCookie(response, "login", result[0].login);
                    response.send(JSON.stringify({body:result[0], code: 200}));
                });
            }
        }catch(e) {
            response.send(JSON.stringify({body: `Ошибка: ${e.message} => ${e.message}`, code: 400}));
        }
    });
});

function addCookie(res, s1, s2) {
    new Promise(function (resolve) {
        res.cookie(s1, s2, {
            maxAge: 0,
            httpOnly: true
        });

        res.cookie(s1, s2, {
            maxAge: 86400 * 1000,
            httpOnly: true
        });
        resolve(1);
    }).then(function () {
        return true;
    });
}