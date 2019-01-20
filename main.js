var WebSocketServer = new require('ws'),
    mysql = new require('mysql');

//База данных
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'Ctvt',
  database: "db"
});
connection.connect();

// подключенные клиенты
var clients = {};
var crntId = 0;

var isGame = false;
var crtRound = -1;

var playersInGame = [null,null,null,null,null]; //id,coins-in-game,cards,gameStatus
var playerIsSeat = 0;

var crtPlayer = -1;
var crtStavka = 0;
var crtStavki = [0,0,0,0,0];
var cardsOnTable = [-1,-1,-1,-1,-1];
var vaBank = [0,0,0,0,0];
var bank = 0;
var coloda = [];

var idPlayersTurns = [];
var idPlayersRound = [];
var playerIsFold = 0;

var SEATS = 5;
var smallBlind = 10;

// WebSocket-сервер на порту 8081
var webSocketServer = new WebSocketServer.Server({
  port: 8081
});

webSocketServer.on('connection', function(ws) {
  console.log("новое соединение");
  var id = null;
  var isAuthorization = false;

  ws.on('message', function(message) {
    console.log('получено сообщение ' + message);
    console.log(playerIsSeat);
    msg = JSON.parse(message);
    //Авторизация
    if(!isAuthorization){
      if(msg["type"] == "login"){
        connection.query('SELECT * FROM users WHERE login = ?',msg['login'], function(err, rows, fields) {
          if (err) throw err;
          if (!(rows[0]['id'] in clients) && rows[0]['password'] == msg['password']){
            id = rows[0]['id'];
            clients[id] = [ws,rows[0]['name'],rows[0]['coins'],-1];

            sendData = {
              "type":"login-status",
              "message": "ok"
            };
            ws.send(JSON.stringify(sendData));
            isAuthorization = true;
            console.log("Успешный вход " + id.toString());
          }
        });
      }else{
        sendData = {
          "type":"login-status",
          "message": "not"
        };
        ws.send(JSON.stringify(sendData));
        ws.close();
      }
    }else{
      if (msg["type"] == "turn" && idPlayersTurns[crtPlayer] == id){
        if (msg["turn-type"] == "rise"){
          rise(idPlayersTurns[crtPlayer],msg["coins"]);
        }else if (msg["turn-type"] == "coll"){
          coll(idPlayersTurns[crtPlayer]);
        }else if (msg["turn-type"] == "check"){
          check(idPlayersTurns[crtPlayer]);
        }else{
          fold(idPlayersTurns[crtPlayer]);
        }
        idPlayersRound[crtPlayer]++;
        let prevPlayer = crtPlayer;
        sendStatusGame();
        nextCrtPlayer();
        if (idPlayersRound[prevPlayer] == idPlayersRound[crtPlayer] &&
            crtStavki[clients[idPlayersTurns[prevPlayer]][3]] == crtStavki[clients[idPlayersTurns[crtPlayer]][3]]){
          for(var i = 0; i < crtStavki.length; i++){
            bank += crtStavki[i];
            crtStavki[i] = 0;
          }
          for(var i = 0; i < idPlayersRound.length;i++){
            idPlayersRound = 0;
          }
          crtRound++;
          if(crtRound == 1){
            cardsOnTable[0] = coloda.shift();
            cardsOnTable[1] = coloda.shift();
            cardsOnTable[2] = coloda.shift();
            ivitePlayerToTurn(crtPlayer);
          }else if(crtRound < 3){
            cardsOnTable[crtRound+1] = coloda.shift();
            ivitePlayerToTurn(crtPlayer);
          }else{

          }
        }else{
          ivitePlayerToTurn(crtPlayer);
        }
      }

      if (msg["type"] == "get-info"){
        if (msg['info'] == "online"){
          res = [];
          for (var key in clients){
            res.push([key,clients[key][1],clients[key][2],clients[key][3]]);
          }
          sendData = {
            "type": "set-info",
            "info": "online",
            "body": res
          };
          ws.send(JSON.stringify(sendData));
        }
      }

      if (msg["type"] == "join-to-game"){
        var isAcc = false;
        if(!isGame &&
          (msg["seat"] < SEATS && msg["seat"] > -1) &&
          (msg["coins"] > 0 && msg["coins"] <= clients[id][2]) &&
          (msg["seat"] != clients[id][3])){

          var isFree = true;
          if(msg["seat"] > -1 && playersInGame[msg["seat"]] != null) isFree = false;
          if (!isFree){
            for(var i = 0; i < playersInGame.length;i++){
              if(playersInGame[i] == null){
                isFree = true;
                msg["seat"] = i;
                break;
              }
            }
          }
          if (isFree){
            if(msg["seat"] != -1 && clients[id][3] == -1){
              playersInGame[msg["seat"]] = [id,msg["coins"],[null,null],-1];
              clients[id][2] -= msg["coins"];
              clients[id][3] = msg["seat"];
              playerIsSeat++;
              isAcc = true;
            }
          }


        }else if (msg["seat"] == -1 && clients[id][3] != -1) {
          //Нужна проверка на ход игры

          clients[id][2] += playersInGame[clients[id][3]][1];
          playersInGame[clients[id][3]] = null;
          clients[id][3] = -1;
          isAcc = true;
          playerIsSeat--;
        }
        if (isAcc){
          sendData = {
            "type":"join-to-game-status",
            "message": "ok",
            "seat": msg["seat"]
          };
          ws.send(JSON.stringify(sendData));
          //Начало неведомой херни. Этот игрок приглашает следующего на ход
          if (playerIsSeat > 1 && isGame == false){
            isGame = true;
            crtRound = 0;
            coloda = [];
            for(var i = 0; i < 52; i++){
              coloda.push(i);
            }
            coloda.sort(function(a,b) {
              return Math.random() - 0.5;
            });

            crtPlayer = 0;
            crtStavka = 0;
            crtStavki = [0,0,0,0,0];
            cardsOnTable = [-1,-1,-1,-1,-1];
            vaBank = [0,0,0,0,0];
            bank = 0;
            idPlayersTurns = [];
            playerIsFold = 0;
            console.log(coloda)
            //Раздаем карты и генерируем очередь игроков
            for(var i = 0; i < SEATS; i++){
              if(playersInGame[i] != null){
                playersInGame[i][2] = [coloda.shift(),coloda.shift()];
                idPlayersTurns.push(playersInGame[i][0]);
                idPlayersRound.push(0);
                playersInGame[i][3] = 0;
              }
            }

            //Начало префлопа
            crtStavka = smallBlind;
            coll(idPlayersTurns[crtPlayer]);
            idPlayersRound[crtPlayer]++;
            sendStatusGame();
            nextCrtPlayer();


            crtStavka = 2*smallBlind;
            coll(idPlayersTurns[crtPlayer]);
            idPlayersRound[crtPlayer]++;
            sendStatusGame();
            nextCrtPlayer();

            //Пригласить на ход следующего игрока
            ivitePlayerToTurn(crtPlayer);
          }
        }else{
          sendData = {
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
    sql = "UPDATE users SET coins = ? WHERE id = ?";
    data = [clients[id][2],id];
    connection.query(sql,data,function(err, rows, fields) {
      if (err) throw err;
    });
    console.log('соединение закрыто ' + id);
    delete clients[id];
    }
  });
});

function ivitePlayerToTurn(inviteTo) {
  console.log("Я здесь")
  let inviteRound = idPlayersRound[inviteTo];
  if(playerIsFold == idPlayersTurns.length) gameStop();
  else{
    sendData = {
      "type":"your-turn"
    };
    clients[idPlayersTurns[inviteTo]][0].send(JSON.stringify(sendData));
    /*setTimeout(function (){
      if (inviteRound == idPlayersRound[inviteTo]){
        fold(idPlayersTurns[crtPlayer]);
        nextCrtPlayer();
        ivitePlayerToTurn(crtPlayer);
      }
    }, 1000000);*/
  }
}

function gameStop(){

}

function nextCrtPlayer(){
  crtPlayer++;
  crtPlayer%=idPlayersTurns.length;
  while(playersInGame[clients[idPlayersTurns[crtPlayer]][3]][3] != 0 && playerIsFold < idPlayersTurns.length){
    crtPlayer++;
    crtPlayer%=idPlayersTurns.length;
  }
}

function fold(id){
  idPlayersRound[crtPlayer]++;
  seat = clients[id][3];
  playersInGame[seat][3] = -1;
  playerIsFold++;
}
function coll(id){
  idPlayersRound[crtPlayer]++;
  seat = clients[id][3];
  if (playersInGame[seat][1] > crtStavka - crtStavki[seat]){
    playersInGame[seat][1] -= crtStavka - crtStavki[seat];
    crtStavki[seat] = crtStavka;
  }else{
    crtStavki[seat] += playersInGame[seat][1];
    vaBank[seat] = crtStavki[seat];
    playersInGame[seat][1] = 0;
    playersInGame[seat][3] = 1;
  }
}
function rise(id,coins){
  idPlayersRound[crtPlayer]++;
  seat = clients[id][3];
  if (playersInGame[seat][1] > coins + crtStavki[seat]){
    crtStavka = coins + crtStavki[seat];
  }
  coll(id);
}
function check(id){
  idPlayersRound[crtPlayer]++;
  if (crtStavka != crtStavki[seat]){
    coll(id);
  }
}
function sendStatusGame(){
  for(var j = 0; j < idPlayersTurns.length;j++){
    _id =  idPlayersTurns[j];
    res = [];
    for(var i = 0; i < idPlayersTurns.length; i++){
      res.push([clients[idPlayersTurns[i]][3], playersInGame[i][1]]);
    }
    sendData = {
      "type":"situation",
      "cards-on-table":cardsOnTable,
      "bank": bank,
      "crt-stavki": crtStavki,
      "players": res,
      "my-cards": playersInGame[clients[_id][3]][2],
      "crt-player": clients[idPlayersTurns[crtPlayer]][3]
    };
    clients[_id][0].send(JSON.stringify(sendData));
  }
}
