//index.js
"use strict";

require("dotenv-safe").load()
const MercadoBitcoin = require("./api").MercadoBitcoin
const MercadoBitcoinTrade = require("./api").MercadoBitcoinTrade
const unirest = require('unirest')

var infoApi = new MercadoBitcoin({ currency: 'BTC' })
var tradeApi = new MercadoBitcoinTrade({
    currency: 'BTC',
    key: process.env.KEY,
    secret: process.env.SECRET,
    pin: process.env.PIN
})

const UtilClass = require("./util").Util
var U = new UtilClass()

var d = {}
d.env = "production" // test | production
d.crawlerInteval = 50000
d.sellAmount = 0.05127
d.buyAmount = 0.05127
d.profit = 0.08
d.stopLoss = 0.016
d.takeProfit = 0.1
d.buyPrice = 28400
d.stopLossPrice = (d.lastPrice * (1 - parseFloat(d.stopLoss))).toFixed(2)
d.endExecution = false
d.checkSellOrder = false
d.confirmTrend = false
d.currentTime = ""
d.bidUSDPrice = 0
d.askUSDPrice = 0
d.supportPrice = 8550
d.resistencePrice = 9200
d.status = ""

function getQuantity(coin, price, isBuy, callback){
    price = parseFloat(price)
    coin = isBuy ? 'brl' : coin.toLowerCase()

    tradeApi.getAccountInfo((response_data) => {
        var balance = parseFloat(response_data.balance[coin].available).toFixed(5)
        balance = parseFloat(balance)
        if (isBuy && balance < 50) return console.log('Sem saldo disponível para comprar!')
        console.log(`Saldo disponível de ${coin}: ${balance}`)
        
        if (isBuy) balance = parseFloat((balance / price).toFixed(5))
        callback(parseFloat(balance) - 0.00001)//tira a diferença que se ganha no arredondamento
    }, 
    (data) => console.log(data))
}

function getBitfinexPrice(success) {
    unirest.get("https://api.bitfinex.com/v2/tickers?symbols=tBTCUSD")
        .headers('Accept', 'application/json')
        .end(function (response) {
            try{
                return success(JSON.parse(response.raw_body));
            }
            catch(ex){ console.log(ex)}
    });
}

function setDate(tickDate) {
    var date = new Date(tickDate*1000);
    // Hours part from the timestamp
    var hours = date.getHours();
    // Minutes part from the timestamp
    var minutes = "0" + date.getMinutes();
    // Seconds part from the timestamp
    var seconds = "0" + date.getSeconds();

    // Will display time in 10:30:23 format
    d.currentTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
}

function trade() {
    if (d.endExecution) {
        console.log("Execution finished.");
        console.log(new Date());
        process.exit(0)
    }

    if (d.checkSellOrder) 
    {
        //TODO checkNewPrice and verify if need cancel and recreate sell order
        console.log("Check if sell order is processed.");
        console.log(new Date());
        process.exit(0)
    }

    infoApi.ticker((tick) => {
        tick = tick.ticker
        //console.log(tick)
        var lastSellOrder = parseFloat(tick.sell).toFixed(2); //Get last sell order
        var lastPrice = parseFloat(tick.last).toFixed(2);  
        
        setDate(tick.date);

        if (lastSellOrder > lastPrice) { //Adjusting for spread problem
            lastPrice = lastSellOrder;
        }

        if (parseInt(lastPrice) == parseInt(d.currentPrice)) {
            logPrices(d, "No action necessary, same price: ", lastPrice);
            d.confirmTrend = false;
            return;
        }

        if (lastPrice < d.takeProfitPrice && lastPrice > d.stopLossPrice) {
            //if (lastPrice > d.currentPrice) {
            //    resetStopLoss(d, lastPrice)
            //}

            logPrices(d, "No action necessary: ", lastPrice);
            d.confirmTrend = false;
            return;
        } else if (lastPrice >= d.takeProfitPrice) {
            logPrices(d, "Take Profit: ", lastPrice);
            console.log("Finished with take profit");
            return;
        } else if (lastPrice <= d.stopLossPrice) {
            logPrices(d, "Stop Loss: ", lastPrice);
        } else {
            logPrices(d, "No action necessary: ", lastPrice);
            d.confirmTrend = false;
            return;
        }
        
        if (!d.confirmTrend) {
            console.log("Confirming trend...")
            d.confirmTrend = true;
            return;
        }
        
        console.log("Trend confirmed...")
        d.confirmTrend = false;
        if (d.env === "test") {
            console.log(`SIMULAÇÃO - Criada ordem de venda ${d.sellAmount} por ${lastPrice}`)
            d.tradeExecution++;
            d.checkSellOrder = true;
        }

        if (d.env === "production") {
            tradeApi.placeSellOrder(d.sellAmount, lastPrice,
                (data) => {
                    console.log(`Criada ordem de venda ${d.sellAmount} por ${lastPrice}`)
                    d.tradeExecution++;
                    d.checkSellOrder = true;
                },
                (data) => {
                    console.log('Erro ao inserir ordem de venda no livro. ' + data)
                }
            )
        }
    })
}

function resetStopLoss(d, lastPrice) {
    d.lastPrice = lastPrice
    d.currentPrice = lastPrice
    d.stopLossPrice = (d.lastPrice * (1 - d.stopLoss)).toFixed(2)
    logPrices(d, "Reset Stop Loss: ")
}

function resetPrices(d, lastPrice) {
    d.lastPrice = lastPrice
    d.currentPrice = lastPrice
    d.takeProfitPrice = (d.lastPrice * (1 + d.takeProfit)).toFixed(2)
    d.stopLossPrice = (d.lastPrice * (1 - d.stopLoss)).toFixed(2)
    logPrices(d, "Reset Prices: ")
}

function logPrices(d, msg, currentPrice) {
    let prices = {}
    
    if (currentPrice) {
        prices.currentPrice = currentPrice
    }

    prices.lastPrice = d.lastPrice
    prices.takeProfitPrice = d.takeProfitPrice
    prices.stopLossPrice = d.stopLossPrice
    prices.currentTime = d.currentTime
    prices.bidUSDPrice = d.bidUSDPrice
    prices.askUSDPrice = d.askUSDPrice
    prices.supportPrice = d.supportPrice
    prices.status = d.askUSDPrice > d.supportPrice ? "HOLD" : "SELL NOW!"
    
    console.log(msg);
    console.log(prices)
}

function start() {
    d.tradeExecution = 0
    resetPrices(d, d.buyPrice)
    infoApi.ticker((tick) => {
        console.log("Start: " + new Date());
        //resetStopLoss(d, parseFloat(tick.ticker.last))
        setInterval(() => getBitfinexPrice(function(data) { d.askUSDPrice = data[0][3]; d.bidUSDPrice = data[0][1]; trade(); } ); , d.crawlerInteval)
    })
}

start();
