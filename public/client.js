let isJoin = false;

let socket = new WebSocket('ws://127.0.0.1:25565');

socket.onopen = function() {
    console.log(("Соединение установлено."))
};
socket.onclose = function(event) {
    console.log('Код: ' + event.code + ' причина: ' + event.reason);
};

socket.onmessage = function(event) {
    let obg = JSON.parse(event.data);
    console.log(obg);
    if(obg.type==="login-status"){
        if(obg.message==="ok"){

            socket.send( JSON.stringify({
                type: "join-to-game",
                seat: 0,
                coins: 100
            }));
        }else{
            console.log("Ошибка!");
        }
    }else if(obg.type==="situation"){

        $("#title_game_bank").text("Банк: " + obg.bank);
        $("#title_game_bet").text("Ставки игроков: "+obg['crt-stavki']);
        $("#title_game_table").text("Стол: "+obg['cards-on-table']);
        $("#title_game_cards").text("Ваши карты: "+obg['my-cards']);
        $("#title_game_turn").text("Ход игрока: "+obg['crt-player']);
    }else if(obg.type==="your-turn"){
        alert("Ваш ход!");
        $("#title_game_turn").text("Ход: ваш");
    }
};

$("#button_fold").click(function(){ // Сбросить
    socket.send( JSON.stringify( {"type":"turn","turn-type": "fold", "coins": null}));
});
//Не btn а button
$("#button_call").click(function(){ // Уровнять
    socket.send( JSON.stringify( {"type":"turn","turn-type": "coll", "coins": null}));
});

$("#button_rise").click(function(){ // Поднять
    let inputRise = $("#inp-rise");
    if(/^[0-9]+$/.test(inputRise.val()) && inputRise.val() > 0){
        socket.send( JSON.stringify( {"type":"turn","turn-type": "rise", "coins": inputRise.val()}));
        inputRise.val("")
    }
});

$("#button_check").click(function(){
    socket.send( JSON.stringify( {"type":"turn","turn-type": "check", "coins": null}));
    $('#card1').delay(500).fadeIn(500);
});


let textError = $('#title_error');
let textErrorSave = $('#title_error-save');

$("#button_authorization").click(function(e) {
    e.preventDefault();
    if(document.getElementById('cb-reg').checked){
        fetch('/api/registration', {
            method: 'POST',
            mode: 'same-origin',
            credentials: 'include',
            redirect: 'follow',
            headers : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                login: $("#input_login").val(),
                password: $("#input_password").val(),
                autojoin: document.getElementById('cb-auto-auth').checked
            }),
        }).then(function(response) {
            if (response.ok) {
                return response.json();
            }else{
                return Promise.reject(new Error(
                    'Response failed: ' + response.status + ' (' + response.statusText + ')'
                ));
            }
        }).then(function(data) {
            console.log("Код:"+data.code+"Сообщение:"+data.body);

            if(data.code === 200){
                textError.text("Успешно!");
                textError.css('color','green');

                $("#title_hello").text("Привет, "+data.body.name+"!");
                $("#input_login").val(data.body.login);
                $("#index_password").val(data.body.password);
                $("#button_authorization").prop('disabled', true);
                $("#title_coins").text("Коины: " + data.body.coins);
                $("#inp-name-new").val(data.body.name);
                $("#input_login-new").val(data.body.login);

                setTimeout(function() {
                    $('#warp_authorization').animate({
                        marginTop: -500
                    }, 700);
                    $("#warp_user").show();
                    socket.send( JSON.stringify({"type": "login","login": data.body.login, "password": data.body.password}));
                }, 1500);
                setTimeout(function(){
                    $("#warp_game").show();
                }, 1600);
            }else{
                textError.fadeTo( 0, 0.0, function() {});
                textError.fadeTo( 1000 , 1.0, function() {});
                setTimeout(function tick() {
                    $( "#title_error" ).fadeTo( 1000 , 0.0, function() {});
                }, 5000);
                textError.text(data.body);
                textError.css('color','red');
                $("#button_authorization").prop('disabled', false);
            }
        }).catch(function(error) {
            console.log(error);
        });

    }else{
        fetch('/api/login', {
            method: 'POST',
            mode: 'same-origin',
            credentials: 'include',
            redirect: 'follow',
            headers : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                login: $("#input_login").val(),
                password: $("#input_password").val(),
                autojoin: document.getElementById('cb-auto-auth').checked
            }),
        }).then(function(response) {
            if (response.ok) {
                return response.json();
            }else{
                return Promise.reject(new Error(
                    'Response failed: ' + response.status + ' (' + response.statusText + ')'
                ));
            }
        }).then(function(data) {
            console.log("Код:"+data.code+"Сообщение:"+data.body);
            if(data.code === 200){
                textError.text("Успешно!");
                textError.css('color','green');

                $("#title_hello").text("Привет, "+data.body.name+"!");
                $("#input_login").val(data.body.login);
                $("#index_password").val(data.body.password);
                $("#button_authorization").prop('disabled', true);
                $("#title_coins").text("Коины: " + data.body.coins);
                $("#inp-name-new").val(data.body.name);
                $("#inp-login-new").val(data.body.login);

                setTimeout(function() {
                    $('#warp_authorization').animate({
                        marginTop: -500
                    }, 700);
                    $("#warp_user").show();
                    socket.send( JSON.stringify({"type": "login","login": data.body.login, "password": data.body.password}));
                }, 1500);
                setTimeout(function(){
                    $("#warp_game").show();
                }, 1600)
            }else{
                textError.fadeTo( 0, 0.0, function() {});
                textError.fadeTo( 1000 , 1.0, function() {});
                setTimeout(function tick() {
                    $( "#title_error" ).fadeTo( 1000 , 0.0, function() {});
                }, 5000);
                textError.text(data.body);
                textError.css('color','red');
                $("#button_authorization").prop('disabled', false);
            }
        }).catch(function(error) {
            console.log(error);
        });
    }
    try{
        let cred  = new window.PasswordCredential({
            id: $('#input_login').val(),
            password: $('#input_password').val()
        });
        navigator.credentials.store(cred);
    }catch (e) {
    }
});
function leave(){

    fetch('/api/logout', {
        method: 'POST',
    })
        .then(function(response) {
            if (!response.ok) {
                return Promise.reject(new Error(
                    'Response failed: ' + response.status + ' (' + response.statusText + ')'
                ));
            }
            return response.json();
        }).then(function(data) {
            console.log(data);
            if(data.code === 200){
                load();
            }

    }).catch(function(error) {
        console.log(error);
    });
}
$('#button_save').click(function(){
    fetch('/api/changedata', {
        method: 'POST',
        mode: 'same-origin',
        credentials: 'include',
        redirect: 'follow',
        headers : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            login: $('#input_new_login').val(),
            name: $("#input_name").val(),
            password: $("#input_new_password").val(),
            passwordold: $("#input_old_password").val(),
        }),
    })
    .then(function(response) {
        if (!response.ok) {
            return Promise.reject(new Error(
                'Response failed: ' + response.status + ' (' + response.statusText + ')'
            ));
        }
        return response.json();
    }).then(function(data) {
        console.log("Код:"+data.code+"Сообщение:"+data.body);
        if(data.code === 200){
            textErrorSave.text("Успешно!");
            textErrorSave.css('color','green');
            setTimeout(function(){
                load();
            }, 1000);
        }else{
            textErrorSave.fadeTo( 0, 0.0, function() {});
            textErrorSave.fadeTo( 1000 , 1.0, function() {});
            setTimeout(function tick() {
                textErrorSave.fadeTo( 1000 , 0.0, function() {});
            }, 5000);
            textErrorSave.text(data.body);
            textErrorSave.css('color','red');
        }
    }).catch(function(error) {
        console.log(error);
    });
});

$("#warp_authorization").mouseenter(function(event){
    event.preventDefault();
    if(isJoin){
        $(this).stop(true, true);
        $(this).css('margin-top', 10);
        $("#button_authorization").prop('disabled', false);
        isJoin = false;
    }
});

function id(){
    setTimeout(function() {
        if (isJoin) {
            $('#warp_authorization').animate({
                marginTop: -500
            }, 700);

            setTimeout(function(){
                $("#warp_game").show();
            }, 700);
        }
    }, 1000);
}

function load(){

    $('#card1').hide();
    $('#warp_user').hide();
    $('#warp_game').hide();
    $('#input_new_password').val("");
    $('#input_old_password').val("");
    $('#warp_authorization').animate({
        marginTop: 10
    }, 700);

    fetch('/api/autoAuth', {
        method: 'POST',
    })
    .then(function(response) {
        if (!response.ok) {
            return Promise.reject(new Error(
                'Response failed: ' + response.status + ' (' + response.statusText + ')'
            ));
        }
        return response.json();
    }).then(function(data) {
        console.log("Код:"+data.code+"Сообщение:"+data.body);
        if(data.code === 200){
            $("#title_hello").text("Привет, "+data.body.name+"!");
            $('#input_name').val(data.body.name);
            $('#input_new_login').val(data.body.login);
            $('#input_login').val(data.body.login);
            $("#button_authorization").prop('disabled', true);
            $("#title_coins").text("Коины: "+data.body.coins);
            document.getElementById('cb-auto-auth').checked = true;
            isJoin = true;
            id();

            socket.send( JSON.stringify({"type": "login","login": data.body.login, "password": data.body.password}));
        }else{
            $("#button_authorization").prop('disabled', false);
        }
    }).catch(function(error) {
        console.log(error);
    });
}

$(document).ready(function() {
    load();
});

function eventReg() {
    if (document.getElementById('cb-reg').checked) {
        $('#button_authorization').text("Регистрация");
    }else{
        $('#button_authorization').text("Авторизация");
    }
}

$('.crd').click(function () {
    (this).classList.toggle('is-flipped');
});
