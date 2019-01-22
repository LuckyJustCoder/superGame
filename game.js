const WebSocketServer = new require('ws');
const mysql = new require('mysql');
const config = require('./config.json');

//База данных

let connection = mysql.createConnection({
    host: config.Game.DataBase.host,
    user: config.Game.DataBase.user,
    password: config.Game.DataBase.password,
    database: config.Game.DataBase.database
});
let webSocketServer = new WebSocketServer.Server({
    port: config.Game.Game.port
});

connection.connect(function(err) {
    if (err) throw err;
    console.log("[DB] => Connected");
});

// подключенные клиенты
let clients = {};
let crntId = 0;

let isGame = false;
let crtRound = -1;

let playersInGame = [null,null,null,null,null]; //id,coins-in-game,cards,gameStatus
let playerIsSeat = 0;

let crtPlayer = -1;
let crtBet = 0;
let crtBets = [0,0,0,0,0];
let cardsOnTable = [-1,-1,-1,-1,-1];
let vaBank = [0,0,0,0,0];
let bank = 0;
let deck = [];

let idPlayersTurns = [];
let idPlayersRound = [];
let playerIsFold = 0;

let SEATS = 5;
let smallBlind = 10;

webSocketServer.on('connection', function(ws) {
    console.log("новое соединение");
    let id = null;
    let isAuthorization = false;

    ws.on('message', function(message) {
        console.log('получено сообщение ' + message);
        console.log(playerIsSeat);
        let msg = JSON.parse(message);
        //Авторизация
        if(!isAuthorization){
            if(msg["type"] === "login"){
                connection.query('SELECT * FROM users WHERE login = ?',msg['login'], function(err, rows) {
                    if (err) throw err;
                    if (!(rows[0]['id'] in clients) && rows[0]['password'] === msg['password']){
                        id = rows[0]['id'];
                        clients[id] = [ws,rows[0]['name'],rows[0]['coins'],-1];

                        let sendData = {
                            "type":"login-status",
                            "message": "ok"
                        };
                        ws.send(JSON.stringify(sendData));
                        isAuthorization = true;
                        console.log("Успешный вход " + id.toString());
                    }
                });
            }else{
                let sendData = {
                    "type":"login-status",
                    "message": "not"
                };
                ws.send(JSON.stringify(sendData));
                ws.close();
            }
        }else{
            if (isGame === true && msg["type"] === "turn" && idPlayersTurns[crtPlayer] === id){
                playerTurn(msg);
            }

            if (msg["type"] === "get-info"){
                if (msg['info'] === "online"){
                    let res = [];
                    for (let key in clients){
                        res.push([key,clients[key][1],clients[key][2],clients[key][3]]);
                    }
                    let sendData = {
                        "type": "set-info",
                        "info": "online",
                        "body": res
                    };
                    ws.send(JSON.stringify(sendData));
                }
            }

            if (msg["type"] === "join-to-game"){
                let isAcc = false;
                if(!isGame &&
                    (msg["seat"] < SEATS && msg["seat"] > -1) &&
                    (msg["coins"] > 0 && msg["coins"] <= clients[id][2]) &&
                    (msg["seat"] !== clients[id][3])){

                    let isFree = true;
                    if(msg["seat"] > -1 && playersInGame[msg["seat"]] != null) isFree = false;
                    if (!isFree){
                        for(let i = 0; i < playersInGame.length;i++){
                            if(playersInGame[i] == null){
                                isFree = true;
                                msg["seat"] = i;
                                break;
                            }
                        }
                    }
                    if (isFree){
                        if(msg["seat"] !== -1 && clients[id][3] === -1){
                            playersInGame[msg["seat"]] = [id,msg["coins"],[null,null],-1];
                            clients[id][2] -= msg["coins"];
                            clients[id][3] = msg["seat"];
                            playerIsSeat++;
                            isAcc = true;
                        }
                    }


                }else if (msg["seat"] === -1 && clients[id][3] !== -1) {
                    //Нужна проверка на ход игры

                    clients[id][2] += playersInGame[clients[id][3]][1];
                    playersInGame[clients[id][3]] = null;
                    clients[id][3] = -1;
                    isAcc = true;
                    playerIsSeat--;
                }
                if (isAcc){
                    let sendData = {
                        "type":"join-to-game-status",
                        "message": "ok",
                        "seat": msg["seat"]
                    };
                    ws.send(JSON.stringify(sendData));
                    //Начало неведомой херни. Этот игрок приглашает следующего на ход
                    if (playerIsSeat > 1 && isGame === false){
                        gameStart();
                    }
                }else{
                    let sendData = {
                        "type":"join-to-game-status",
                        "message": "not"
                    };
                    ws.send(JSON.stringify(sendData));
            }
        }
    }
});

    //Отключение
    ws.on('close', function() {
        if(isAuthorization){
        if(playersInGame[clients[id][3]]){
            playerIsSeat--;
            clients[id][2] += playersInGame[clients[id][3]][1];
            playersInGame[clients[id][3]] = null;
            playerIsFold++;
        }
        let sql = "UPDATE users SET coins = ? WHERE id = ?";
        let data = [clients[id][2],id];
        connection.query(sql,data,function(err) {
            if (err) throw err;
        });
        console.log('соединение закрыто ' + id);
        delete clients[id];
        }
    });
});

function invitePlayerToTurn(inviteTo) {

    //let inviteRound = idPlayersRound[inviteTo];
    if(playerIsFold === idPlayersTurns.length) gameStop();
    else{
        let sendData = {
            "type":"your-turn"
        };
        clients[idPlayersTurns[inviteTo]][0].send(JSON.stringify(sendData));
        /*setTimeout(function (){
            if (inviteRound == idPlayersRound[inviteTo]){
                fold(idPlayersTurns[crtPlayer]);
                nextCrtPlayer();
                invitePlayerToTurn(crtPlayer);
            }
        }, 1000000);*/
    }
}

function playerTurn(msg){
    console.log("hello");
    if (msg["turn-type"] === "rise"){
        rise(idPlayersTurns[crtPlayer],parseInt(msg["coins"]));
    }else if (msg["turn-type"] === "coll"){
        coll(idPlayersTurns[crtPlayer]);
    }else if (msg["turn-type"] === "check"){
        check(idPlayersTurns[crtPlayer]);
    }else{
        fold(idPlayersTurns[crtPlayer]);
    }
    idPlayersRound[crtPlayer]++;
    console.log(idPlayersRound);
    let prevPlayer = crtPlayer;
    sendStatusGame();
    nextCrtPlayer();
    if (idPlayersRound[crtPlayer] !== 0 &&
            idPlayersRound[prevPlayer] >= idPlayersRound[crtPlayer] &&
            crtBets[clients[idPlayersTurns[prevPlayer]][3]] === crtBets[clients[idPlayersTurns[crtPlayer]][3]]){
        for(let i = 0; i < crtBets.length; i++){
            bank += crtBets[i];
            crtBets[i] = 0;
        }
        for(let i = 0; i < idPlayersRound.length;i++){
            idPlayersRound[i] = 0;
        }
        crtRound++;
        crtBet = 0;
        if(crtRound === 1){
            cardsOnTable[0] = deck.shift();
            cardsOnTable[1] = deck.shift();
            cardsOnTable[2] = deck.shift();
            sendStatusGame();
            invitePlayerToTurn(crtPlayer);
        }else if(crtRound < 4){
            cardsOnTable[crtRound+1] = deck.shift();
            sendStatusGame();
            invitePlayerToTurn(crtPlayer);
        }else{
            sendStatusGame();
            gameStop();
        }
    }else{
        sendStatusGame();
        invitePlayerToTurn(crtPlayer);
    }
}

function gameStart(){
    isGame = true;
    crtRound = 0;
    deck = [];
    for(let i = 0; i < 52; i++){
        deck.push(i);
    }
    deck.sort(function() {
        return Math.random() - 0.5;
    });

    crtPlayer = 0;
    crtBet = 0;
    crtBets = [0,0,0,0,0];
    cardsOnTable = [-1,-1,-1,-1,-1];
    vaBank = [0,0,0,0,0];
    bank = 0;
    idPlayersTurns = [];
    idPlayersRound = [];
    playerIsFold = 0;
    //Раздаем карты и генерируем очередь игроков
    for(let i = 0; i < SEATS; i++){
        if(playersInGame[i] != null){
            playersInGame[i][2] = [deck.shift(),deck.shift()];
            idPlayersTurns.push(playersInGame[i][0]);
            idPlayersRound.push(0);
            playersInGame[i][3] = 0;
        }
    }

    //Начало префлопа
    sendStatusGame();
    crtBet = smallBlind;
    coll(idPlayersTurns[crtPlayer]);
    idPlayersRound[crtPlayer]++;
    sendStatusGame();
    nextCrtPlayer();

    sendStatusGame();
    crtBet = 2*smallBlind;
    coll(idPlayersTurns[crtPlayer]);
    idPlayersRound[crtPlayer]++;
    sendStatusGame();
    nextCrtPlayer();

    //Пригласить на ход следующего игрока
    invitePlayerToTurn(crtPlayer);
}

function gameStop(){
    isGame = false;
    /*let scoreWin = function (seat){
        let cards = cardsOnTable + playersInGame[seat][2];
        let musts = [];
        let values = [];

        cards.sort();
        for(let i = 0; i < cards.length; i++){
            musts.push(cards[i]/13);
            values.push(cards[i]%13);
        }
        //Стрит флеш
        let isStreet = -1;
        let v = values[0];
        let m = musts[0];
        let crt = 0;
        for(let i = 0; i < cards.length; i++){
            if(values[i] != v && values[i] === v + 1 && m == musts[i]){
                crt++;
                v = values[i];
            }else if(values[i] != v){
                crt = 0;
                v = values[i];
                m = musts[i];
            }
            if(crt > 4 && v[i] > isStreet){
                isStreet = v[i];
            }
        }
    };*/

    //Отослать всем результаты игры
    res = [];
    for(let i = 0; i < idPlayersTurns.length; i++){
        res.push([clients[idPlayersTurns[i]][3], playersInGame[i][2]]);
    }
    let sendData = {
      "type": "game-stop",
      "cards-on-table": cardsOnTable,
      "players": res
    };
    for(let i = 0; i < idPlayersTurns.length; i++){
      clients[idPlayersTurns[i]][0].send(JSON.stringify(sendData));
    }

}

function nextCrtPlayer(){
    crtPlayer++;
    crtPlayer%=idPlayersTurns.length;
    while(playersInGame[clients[idPlayersTurns[crtPlayer]][3]][3] !== 0 && playerIsFold < idPlayersTurns.length){
        crtPlayer++;
        crtPlayer%=idPlayersTurns.length;
    }
}

function fold(id){
    //idPlayersRound[crtPlayer]++;
    let seat = clients[id][3];
    playersInGame[seat][3] = -1;
    playerIsFold++;
}
function coll(id){
    //idPlayersRound[crtPlayer]++;
    let seat = clients[id][3];
    if (playersInGame[seat][1] > crtBet - crtBets[seat]){
        playersInGame[seat][1] -= crtBet - crtBets[seat];
        crtBets[seat] = crtBet;
    }else{
        crtBets[seat] += playersInGame[seat][1];
        vaBank[seat] = crtBets[seat];
        playersInGame[seat][1] = 0;
        playersInGame[seat][3] = 1;
    }
}
function rise(id,coins){
    //idPlayersRound[crtPlayer]++;
    let seat = clients[id][3];
    if (playersInGame[seat][1] > coins && coins + crtBets[seat] > crtBet){
        crtBet = coins + crtBets[seat];
    }
    coll(id);
}
function check(id){
    let seat = clients[id][3];
    //idPlayersRound[crtPlayer]++;
    if (crtBet !== crtBets[seat]){
        coll(id);
    }
}
function sendStatusGame(){
    for(let j = 0; j < idPlayersTurns.length;j++){
        let _id =  idPlayersTurns[j];
        let res = [];
        for(let i = 0; i < idPlayersTurns.length; i++){
            res.push([clients[idPlayersTurns[i]][3], playersInGame[i][1]]);
        }
        let sendData = {
            "type":"situation",
            "cards-on-table":cardsOnTable,
            "bank": bank,
            "crt-stavki": crtBets,
            "players": res,
            "my-cards": playersInGame[clients[_id][3]][2],
            "crt-player": clients[idPlayersTurns[crtPlayer]][3]
        };
        clients[_id][0].send(JSON.stringify(sendData));
    }
}
