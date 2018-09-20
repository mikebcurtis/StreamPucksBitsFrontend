
//Launcher object to be used in JSON for game
var Launch = function (side, angle, power, pucks) {
    var userInfo = TwitchUserManager.getUserInfo();
    var twitchAuth = TwitchUserManager.getAuth();
    var logo = userInfo.logo;
    var userId = userInfo._id;
    var displayName = userInfo.display_name;

    // generate unique Id
    var idLength = 9;
    var generatedId = "";
    var charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < idLength; i++) {
        generatedId += charSet.charAt(Math.floor(Math.random() * charSet.length));
    }

    return {
        "avatarUrl": userInfo.logo,
        "id": generatedId, // include this so the backend can identify two separate launches that have identical parameters
        "opaqueUserId": twitchAuth.userId,
        "userId": userInfo._id,
        "side": side, //int value of 0 for left and 1 for right
        "angle": angle,
        "power": power,
        "pucks": pucks,
        "timestamp": Date.now(),
        "displayName": userInfo.display_name,
        "trail": EBSManager.getCurrentTrail()
    };
};

// TwitchUserManager manages Twitch auth and pubsub
var TwitchUserManager = (function(){
    // private members
    var twitchAuth;
    var payload;
    var userInfo;
    var newUser = true;
    var currentPuckCount;

    var sendUserInfo = function(){
        $.ajax({
            url: EBSManager.getWildUserAppearsUrl(twitchAuth.channelId, payload.user_id, payload.opaque_user_id),
            //url: 'https://us-central1-twitchplaysballgame.cloudfunctions.net/wildUserAppears?channelId=' + twitchAuth.channelId + '&playerId=' + payload.user_id + '&opaqueUserId=' + payload.opaque_user_id,
            type: 'GET',
            headers: {
                'x-extension-jwt': twitchAuth.token
            }
        }).done(function (response) {
            currentPuckCount = response.puckCount;
            TemplateManager.LoadHeaderTemplate(undefined, undefined, response.puckCount, response.points);
        });
    };

    var requestUserInfo = function(trueUserId) {
        $.ajax({
            url: 'https://api.twitch.tv/kraken/users/' + trueUserId, //get user autherization to aquire userID, not opaqueUserID
            type: 'GET',
            dataType: 'json',
            headers: {
                'Accept': 'application/vnd.twitchtv.v5+json',
                //'Client-ID': 'y4jq5ejqgodi64cueqvjdip2ekfg0r', // no-bits extension
                'Client-ID': '4ynfkfb761mf5gbcslrgt8ksov8im6' // bits-enabled extension
            }
        }).done(function (response) {
            TemplateManager.LoadHeaderTemplate(response.display_name, response.logo, undefined, undefined);
            userInfo = response;
        });
    }



    return {
        // public members
        getPuckCount: function() {
            return currentPuckCount;
        },
        setPuckCount: function(puckCount) {
            // TODO validate puckCount is int
            currentPuckCount = puckCount;
        },
        getUserInfo: function() {
            return userInfo;
        },
        getPayload: function () {
            return payload;
        },
        getAuth: function(){
            return twitchAuth;
        },
        setAuth: function(auth){
            twitchAuth = auth;
            var parts = auth.token.split(".");
            payload = JSON.parse(window.atob(parts[1]));
        
            if (newUser === true) {
                sendUserInfo();
                newUser = false;
            }
        
            if (payload.user_id) {
                // user has granted
                requestUserInfo(payload.user_id);
            }
            else {
                // user has not granted permission, request it
                window.Twitch.ext.actions.requestIdShare();
            }
            
            window.Twitch.ext.listen("broadcast", function (target, type, msg) {
                if (type === "application/json") {
                    var msgJSON = JSON.parse(msg);
                    if (msgJSON.hasOwnProperty(payload.user_id) === false) {
                        return; // this broadcast didn't have any updates for this user
                    }
                    var puckCount;
                    var points;
        
                    if (msgJSON[payload.user_id].puckCount !== undefined) {
                        puckCount = msgJSON[payload.user_id].puckCount;
                        TwitchUserManager.setPuckCount(puckCount);
                    }
        
                    if (msgJSON[payload.user_id].points !== undefined) {
                        points = msgJSON[payload.user_id].points;
                    }

                    TemplateManager.LoadHeaderTemplate(undefined, undefined, puckCount, points);
                }
            });
            EBSManager.initStoreItems(twitchAuth, payload);
        }
    };
})();

// TemplateManager manages view templates
var TemplateManager = (function(){

    //disable launch button after click for a few seconds
    var disableSendButton = function(sendButton) {
        var disabledSeconds = 5;
        sendButton.disabled = true;
        if (sendButton.disabled === true) {
            var disabledTimer = setInterval(function () {
                sendButton.textContent = 'Queuing Launch ' + disabledSeconds;
                disabledSeconds--;
                if (disabledSeconds <= 0) {
                    clearInterval(disabledTimer);
                }
            }, 1000);
        };
        setTimeout(function () {
            sendButton.disabled = false;
            if (sendButton.disabled === false) {
                sendButton.textContent = 'Launch';
            }
        }, 6000);
    };

    var allowNumbersOnly = function(e) {
        var charCode = e.which ? e.which : e.keyCode;
        if (charCode > 31 && (charCode < 48 || charCode > 57)) {
            e.preventDefault();
        }
    }

    var initLauncherAngleCntl = function(side) {
        var imgId;
        var sliderId;
        var displayId;
        var directionMultiplier;
        if (side === 0) {
            imgId = "#leftAngleImg";
            sliderId = "leftAngleSlider";
            displayId = "#leftAngleDisplay";
            directionMultiplier = -1;
        }
        else {
            imgId = "#rightAngleImg";
            sliderId = "rightAngleSlider";
            displayId = "#rightAngleDisplay";            
            directionMultiplier = 1;
        }

        var sliderChangeHandler = function() {
            var newVal = $("#" + sliderId).val();
            var value = newVal * directionMultiplier;
            $(imgId).css("transform", "rotate(" + value + "deg)");
            $(imgId).css("-ms-transform", "rotate(" + value + "deg)");
            $(imgId).css("-webkit-transform", "rotate(" + value + "deg)");

            $(displayId).html("Angle: " + newVal);
        };

        var sliderElement = document.getElementById(sliderId);
        sliderElement.addEventListener("input", sliderChangeHandler);
        sliderElement.addEventListener("change", sliderChangeHandler);

        sliderChangeHandler();
    }

    return {
        LoadLaunchTemplate: function() {
            var launchTemplate = Handlebars.templates.launch;
            $("#main").html(launchTemplate());
            
            var leftPowerSlider = document.getElementById("leftPowerSlider");
            var rightPowerSlider = document.getElementById("rightPowerSlider");
            var leftPowerOutput = document.getElementById("leftPowerDisplay");
            var rightPowerOutput = document.getElementById("rightPowerDisplay");
            var sendButton = document.getElementById("sendButton");
            var leftPucks = document.getElementById("leftLauncher");
            var rightPucks = document.getElementById("rightLauncher");
            var leftAngleSlider = document.getElementById("leftAngleSlider");
            var rightAngleSlider = document.getElementById("rightAngleSlider");
            var launcherValues = EBSManager.getCurrentLauncherValues();
        
            leftPowerSlider.value = launcherValues.left[0].power;
            rightPowerSlider.value = launcherValues.right[0].power;
            leftAngleSlider.value = launcherValues.left[0].angle;
            rightAngleSlider.value = launcherValues.right[0].angle;
            leftPucks.value = launcherValues.left[0].puckAmount;
            rightPucks.value = launcherValues.right[0].puckAmount;
            leftPowerOutput.innerHTML = "Power: " + leftPowerSlider.value;
            rightPowerOutput.innerHTML = "Power: " + rightPowerSlider.value;
        
            initLauncherAngleCntl(0);
            initLauncherAngleCntl(1);
            
            // Only allow numbers to be put into the puck input boxes
            leftPucks.onkeypress = allowNumbersOnly;
            rightPucks.onkeypress = allowNumbersOnly;

            //Display for Power Slider
            leftPowerSlider.oninput = function () {
                leftPowerOutput.innerHTML = "Power: " + this.value;
            };
            rightPowerSlider.oninput = function () {
                rightPowerOutput.innerHTML = "Power: " + this.value;
            };
        
            $("#sendButton").unbind('click');
            $("#sendButton").bind('click', function() {
                //set all values to numbers
                var totalPucksLaunched = parseInt(leftPucks.value) + parseInt(rightPucks.value);
                var currentPuckCount = TwitchUserManager.getPuckCount();
                try {
                    if (totalPucksLaunched > currentPuckCount) {
                        throw "Not enough pucks to complete launch. Please change total amount to " + currentPuckCount + " pucks or less.";
                    }
                    else if (leftPucks.value > 50 && rightPucks.value > 50) {
                        throw "Both Launchers values are greater than 50 pucks.";
                    }
                    else if (leftPucks.value > 50) {
                        throw "Left Launcher value is greater than 50 pucks.";
                    }
                    else if (rightPucks.value > 50) {
                        throw "Right Launcher value is greater than 50 pucks.";
                    }
                    else if (rightPucks.value == 0 && leftPucks.value == 0) {
                        throw "Please enter pucks to launch. Both amounts are currently 0.";
                    }
                    else if (TwitchUserManager.getUserInfo() === undefined) {
                        throw "Unable to obtain user info. To play, please allow this extension to know your User ID on Twitch by clicking the \"Grant Permissions\" button below.";
                    }
                    else {
                        var left = new Launch(0, leftAngleSlider.value, leftPowerSlider.value, leftPucks.value);
                        var right = new Launch(1, rightAngleSlider.value, rightPowerSlider.value, rightPucks.value);
                        var launches = new Array();
                        if (left.pucks > 0) {
                            launches.push(left);
                        }
                        if (right.pucks > 0) {
                            launches.push(right);
                        }
                        if (launches.length > 0) {
                            EBSManager.sendLaunches(launches);
                            disableSendButton(sendButton);
                        }

                        document.getElementById("error").innerHTML = ""; //remove error
                    }
                }
                catch (err) {
                    document.getElementById("error").innerHTML = err;
                }
            });                
        },
        LoadHeaderTemplate: function(userName, avatarUrl, totalPucks, points) {
            // if username, totalpucks, or points were given as undefined values, and
            // the header has been loaded already, just grab the value that was already
            // loaded previously. That way this function can be used to just update a
            // single value instead of having to provide all three at once.

            if (userName === undefined && $("#userName").length) {
                userName = $("#userName").text();
            }

            if (avatarUrl === undefined && $("#avatarImg").length) {
                avatarUrl = $("#avatarImg").prop('src');
            }

            if (totalPucks === undefined && $("#totalPucks").length) {
                totalPucks = $("#totalPucks").text();
            }
            
            if (points === undefined && $("#playerScore").length) {
                points = $("#playerScore").text();
            }    

            var headerTemplate = Handlebars.templates.header;
            $("#header").html(headerTemplate({
                userName: userName,
                avatarUrl: avatarUrl,
                totalPucks: totalPucks,
                playerScore: points
            }));
        },
        LoadTabTemplate: function () {
            var tabsTemplate = Handlebars.templates.tabs;
            $("#tabs").html(tabsTemplate());
            $("#launchTab").click(function () {
                TemplateManager.LoadLaunchTemplate();
                $('.active').removeClass("active");
                $(this).addClass("active");
            });
            $("#storeTab").click(function () {
                if ($("#launchTab").hasClass("active")) {
                    EBSManager.setCurrentLauncherValues($("#leftAngleSlider").val(), $("#rightAngleSlider").val(),
                        $("#leftPowerSlider").val(), $("#rightPowerSlider").val(), $("#leftLauncher").val(), $("#rightLauncher").val());
                } //if the launch tab is active, it will save the launcher values, otherwise it won't worry about it
                TemplateManager.LoadStoreTemplate(EBSManager.getStoreItems(), EBSManager.getPurchasedItems());
                $('.active').removeClass("active");
                $(this).addClass("active");
            });
            $("#aboutTab").click(function () {
                if ($("#launchTab").hasClass("active")) {
                    EBSManager.setCurrentLauncherValues($("#leftAngleSlider").val(), $("#rightAngleSlider").val(),
                        $("#leftPowerSlider").val(), $("#rightPowerSlider").val(), $("#leftLauncher").val(), $("#rightLauncher").val());
                } //if the launch tab is active, it will save the launcher values, otherwise it won't worry about it
                TemplateManager.LoadAboutTemplate();
                $('.active').removeClass("active");
                $(this).toggleClass("active");
            });
        },
        LoadStoreTemplate: function (storeItems, purchasedItems) {
            var storeTemplate = Handlebars.templates.store;
            $("#main").html(storeTemplate(storeItems));
            for (var i = 0; i < purchasedItems.items.length; i++) {
                for (var j = 0; j < storeItems.items.length; j++) {

                    //Loads the active button from a previous selection
                    if (purchasedItems.items[i].id === storeItems.items[j].id && purchasedItems.items[i].active === true) {
                        $("#" + purchasedItems.items[i].id).html("Active");
                        $("#" + purchasedItems.items[i].id).prop("disabled", true);
                        $("#" + purchasedItems.items[i].id).attr("name", "activated");
                        $("#" + purchasedItems.items[i].id).attr("class", "activatedButton");
                    }
                    else if (purchasedItems.items[i].id === storeItems.items[j].id) {
                        $("#" + purchasedItems.items[i].id).html("Apply");
                        $("#" + purchasedItems.items[i].id).prop("disabled", false);
                        $("#" + purchasedItems.items[i].id).attr("name", "inactivated");
                        $("#" + purchasedItems.items[i].id).attr("class", "purchaseButton");
                    }
                }
            }
            $(".purchaseButton").click(function () {
                var buttonType = $(this).html();
                var itemId = $(this).attr('id');
                //var activeItem = document.getElementsByName("active");
                var activeItem = $("[name='activated']");
                if (buttonType === "Use Points") {
                    $(this).html("Confirm?");
                }
                else if (buttonType === "Confirm?") {
                    EBSManager.storePurchasePointsUpdate(itemId, this);
                }
                else if (buttonType === "Apply") {
                    $(this).html("Active");
                    $(this).prop("disabled", true);
                    //change other buttons that are purchased to apply instead of active
                    for (var i = 0; i < activeItem.length; i++) {
                        activeItem[i].disabled = false;
                        activeItem[i].innerHTML = "Apply";
                        activeItem[i].name = "inactivated";
                        activeItem[i].className = "purchaseButton";
                    }
                    $(this).attr("class", "activatedButton")
                    $(this).attr("name", "activated");
                    EBSManager.setCurrentTrail(itemId);
                    EBSManager.setActivePurchasedItem($(this).attr("id"));
                }
                //var element = document.getElementsByClassName(className);
                ////element.style["pointer-events"] = "none";
                //EBSManager.storePurchasePointsUpdate(className);
            });
        },
        LoadAboutTemplate: function () {
            var aboutTemplate = Handlebars.templates.about;
            $("#main").html(aboutTemplate());
        }
    };
})();

// EBSManager manages access to the Stream Pucks backend service.
var EBSManager = (function () {
    var storeItems;
    var currentTrail;
    var purchased;
    var currentLauncherValues;
    var prodHost = 'https://us-central1-twitchplaysballgame.cloudfunctions.net/';
    var stagingHost = 'https://us-central1-streampucksstaging.cloudfunctions.net/';
    var staging = true; // switch to false to hit the production endpoint
    var getHost = function() {
        if (staging) {
            return stagingHost;
        }
        else {
            return prodHost;
        }
    };

    return {
        initStoreItems: function (auth, payload) {
            $.ajax({
                url: this.getPopulateStoreItemsUrl(auth.channelId, payload.user_id),
                //url: 'https://us-central1-twitchplaysballgame.cloudfunctions.net/populateStoreItems?channelId=' + auth.channelId + '&playerId=' + payload.user_id,
                type: 'GET',
                dataType: 'json',
            }).done(function (response) {
                var allItems = response.store;
                var purchasedItems = response.itemsPurchased;
                storeItems = { items: [] };
                purchased = { items: [] };
                for (var i in purchasedItems) {
                    purchased.items.push({
                        id: i,
                        name: purchasedItems[i],
                        active: false
                    });
                }
                for (var j in allItems) {
                    storeItems.items.push({
                        id: j,
                        name: allItems[j].name,
                        description: allItems[j].description,
                        cost: allItems[j].cost
                    });
                }
            });
        },

        initLauncherValues: function () {
            currentLauncherValues = {
                left: [{
                    angle: 45,
                    power: 50,
                    puckAmount: 0
                }],
                right: [{
                    angle: 45,
                    power: 50,
                    puckAmount: 0
                }]
            };
        },

        sendLaunches: function(launches) {
            var twitchAuth = TwitchUserManager.getAuth();

            if (twitchAuth === undefined) {
                return;
            }

            var payload = TwitchUserManager.getPayload();

            if (payload === undefined) {
                return;
            }

            $.ajax({
                url: this.getQueueLaunchUrl(twitchAuth.channelId, payload.userId),
                //url: 'https://us-central1-twitchplaysballgame.cloudfunctions.net/queueLaunch?channelId=' + twitchAuth.channelId + '&playerId=' + payload.userId,
                contentType: 'application/json',
                type: 'POST',
                headers: {
                    'x-extension-jwt': twitchAuth.token
                },
                data: JSON.stringify(launches)
            }).done(function (response) {
                // noop
            });
        },

        storePurchasePointsUpdate: function (storeItemId, buttonPressed) {
            var twitchAuth = TwitchUserManager.getAuth();

            if (twitchAuth === undefined) {
                return;
            }
            var payload = TwitchUserManager.getPayload();

            if (payload === undefined) {
                return;
            }
            $("body").css("cursor", "progress");
            $.ajax({
                url: this.getPurchasePointsUpdateUrl(twitchAuth.channelId, payload.user_id, storeItemId),
                //url: 'https://us-central1-twitchplaysballgame.cloudfunctions.net/purchasePointsUpdate?channelId=' + twitchAuth.channelId + '&playerId=' + payload.user_id + '&storeItemId=' + storeItemId,
                type: 'POST',
                success: function (result) {
                    var activeItem = $("[name='activated']");
                    var itemId = $(buttonPressed).attr('id');
                    $(buttonPressed).html("Active");
                    $(buttonPressed).prop("disabled", true);
                    //change other buttons that are purchased to apply instead of active
                    for (var i = 0; i < activeItem.length; i++) {
                        activeItem[i].disabled = false;
                        activeItem[i].innerHTML = "Apply";
                        activeItem[i].name = "inactivated";
                        activeItem[i].className = "purchaseButton";
                    }
                    $(buttonPressed).attr("class", "activatedButton")
                    $(buttonPressed).attr("name", "activated");
                    EBSManager.setCurrentTrail(itemId);
                    EBSManager.addPurchasedItem(storeItemId);
                    if (result !== undefined && result !== "") {
                        TemplateManager.LoadHeaderTemplate(undefined, undefined, undefined, result);
                    }
                },
                error: function (request, status, error) {
                    var itemId = $(buttonPressed).attr('id');
                    document.getElementById("error " + itemId).innerHTML = "Error: " + request.responseText;
                    if (request.status == 410) {
                        $(buttonPressed).html("Apply");
                        $(buttonPressed).prop("disabled", false);
                        $(buttonPressed).attr("name", "inactivated");
                        EBSManager.addPurchasedItem(storeItemId);
                    }
                    else {
                        $(buttonPressed).html("Use Points");
                    }
                }

            });
            $("body").css("cursor", "default");
        },

        getStoreItems: function () {
            return storeItems;
        },

        getPurchasedItems: function () {
            return purchased;
        },

        getCurrentLauncherValues: function () {
            return currentLauncherValues;
        },

        getCurrentTrail: function () {
            if (currentTrail === null) {
                currentTrail = 'default';
            }
            return currentTrail;
        },

        addPurchasedItem: function (newItem) {
            purchased.items.push({
                id: newItem,
                name: newItem,
                active: true
            });
            this.setActivePurchasedItem(newItem);
        },

        setActivePurchasedItem: function (itemId) {
            for (var i in purchased.items) {
                if (purchased.items[i].id === itemId) {
                    purchased.items[i].active = true;
                }
                else {
                    purchased.items[i].active = false;
                }
            }
        },

        setCurrentLauncherValues: function (leftAngle, rightAngle, leftPower, rightPower, leftPucks, rightPucks) {
            currentLauncherValues = {
                left: [{
                    angle: leftAngle,
                    power: leftPower,
                    puckAmount: leftPucks
                }],
                right: [{
                    angle: rightAngle,
                    power: rightPower,
                    puckAmount: rightPucks
                }]
            };
        },

        setCurrentTrail: function (trailId) {
            currentTrail = trailId;
        },

        getWildUserAppearsUrl: function(channelId, userId, opaqueUserId){
            return getHost() + '/wildUserAppears?channelId=' + channelId + '&playerId=' + userId + '&opaqueUserId=' + opaqueUserId;
        },

        getPopulateStoreItemsUrl: function(channelId, playerId) {
            return getHost() + '/populateStoreItems?channelId=' + channelId + '&playerId=' + playerId;
        },

        getQueueLaunchUrl: function (channelId, userId) {
            return getHost() + '/queueLaunch?channelId=' + channelId + '&playerId=' + userId;
        }, 

        getPurchasePointsUpdateUrl: function(channelId, playerId, storeItemId) {
            return getHost() + '/purchasePointsUpdate?channelId=' + channelId + '&playerId=' + playerId + '&storeItemId=' + storeItemId;
        }
    };
})();

$(document).ready(function () {
    EBSManager.initLauncherValues();
    TemplateManager.LoadTabTemplate();
    this.getElementById("launchTab").click();//initialize launch tab as default view
});

//get twitch auth values
window.Twitch.ext.onAuthorized(TwitchUserManager.setAuth);


