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

var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAILUSER,
    pass: process.env.MAILPASS
  }
});

var mailOptions = {
  from: process.env.MAILFROM,
  to: process.env.MAILTO, 
  subject: 'Order created!',
  text: 'Created order!'
};

var d = {}
var p = {}
d.test = true
d.crawlerInteval = 20000
d.amountBTC = 0.02
d.askUSD = 99999
d.bidUSD = 0

p.priceBRL = 99999
p.priceUSD = 0
p.stopUSD = (8530.0).toFixed(1)
p.profitUSD = (8540.0).toFixed(1)

p.currentTime = ""

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

// Will return time as 10:30:23
function formatDate(date) {
     return date.getHours() + ':' + ("0" + date.getMinutes()).substr(-2) + ':' + ("0" + date.getSeconds()).substr(-2);
}

function sendEmail(message, callback) {
    mailOptions.text = message;
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }

      callback();
    });
}
function checkBuyOperation() {
    infoApi.ticker((tick) => {
        console.log("");
        tick = tick.ticker;
        //console.log(tick)
        p.currentTime = formatDate(new Date(tick.date*1000));
        
        var sellBRL = parseFloat(tick.sell).toFixed(2); //Get last BRL sell order
        p.priceBRL = parseFloat(tick.last).toFixed(2);  
        p.priceBRL = sellBRL > p.priceBRL ? sellBRL : p.priceBRL; //Adjusting for spread problem

        console.log(p);
        
        
        if (d.askUSD > p.stopUSD && d.askUSD < p.profitUSD) {
            return;
        } else if (d.askUSD > p.profitUSD) {
            p.stopUSD = p.profitUSD
            p.profitUSD = d.askUSD
            console.log("Operation success. NewStop: " + p.stopUSD + "; NewProfit: " + p.profitUSD);
            return;
        } else {
            var msg = "Criada ordem de venda " + d.amountBTC + " por " + p.priceBRL;
            console.log(msg);
            if (d.test === true) {
                //process.exit(0);
                sendEmail(msg, function () { process.exit(0); });
            } else {
                tradeApi.placeSellOrder(d.amountBTC, p.priceBRL,
                    (data) => { sendEmail(msg, function () { process.exit(0); } ); },
                    (data) => { console.log('Erro ao inserir ordem de venda no livro. ' + data) }
                )
            }
        }
    })
}

function checkSellOperation() {
    infoApi.ticker((tick) => {
        tick = tick.ticker
        //console.log(tick)
        p.currentTime = formatDate(new Date(tick.date*1000));
        
        var lastBuyBRLOrder = parseFloat(tick.buy).toFixed(2); //Get last BRL buy order
        p.lastBRLPrice = parseFloat(tick.last).toFixed(2);  
        p.lastBRLPrice = lastBuyBRLOrder < p.lastBRLPrice ? lastBuyBRLOrder : p.lastBRLPrice; //Adjusting for spread problem
        
        if (p.bidUSDPrice > p.takeProfitUSD) {
            console.log("bidUSD: " + p.bidUSDPrice + "; takeUSD: " + p.takeProfitUSD + "; askBRL: " + p.lastBRLPrice);
            return;
        }

        console.log("Stop loss: ");
        console.log(p);

        if (d.test === true) {
            console.log(`SIMULAÇÃO - Criada ordem de venda ${d.sellBTCAmount} por ${p.lastBRLPrice}`)
        } else {
            tradeApi.placeSellOrder(d.sellBTCAmount, p.lastBRLPrice,
                (data) => { console.log(`Criada ordem de venda ${d.sellBTCAmount} por ${p.lastBRLPrice}`) },
                (data) => { console.log('Erro ao inserir ordem de venda no livro. ' + data) }
            )
        }
    })
}

function start() {
    infoApi.ticker((tick) => {
        console.log("Start: " + formatDate(new Date()));
        setInterval(() => getBitfinexPrice(
                function(data) { 
                    p.priceUSD = d.askUSD;
                    d.askUSD = parseInt(data[0][3]).toFixed(1);
                    d.bidUSD = parseInt(data[0][1]).toFixed(1);

                    checkBuyOperation();
                    //checkSellOperation();
                } ) , d.crawlerInteval)
    })
}

start();
