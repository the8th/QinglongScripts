/*
[Bing.com] 抓取每日壁纸
*/
const {request} = require("undici")
const fsp = require("fs/promises")
const path = require("path")
class DownloadTodayBingImage{
    constructor(){
        this.root = "/home/upload" //保存位置
        this.host = "https://cn.bing.com"
        console.log("starting...")
        this.downloadTodayBingImage()
    }
    async saveImage(image, json){
        const fileName = image.url.split("/th?id=")[1].split(".jpg&")[0] + ".jpg"
        const url = `${this.host}/th?id=${fileName}`
        const previewUrl = `${url}&w=384&h=216` //得到缩略图
        /*
        const {body:previewImgBody} = await request(previewUrl)
        const arrayBuffer = await previewImgBody.arrayBuffer()
        const base64 = this.getBase64FromArrayBuffer(arrayBuffer)
        */
        const {body} = await request(url)
        const imagePath = path.join(this.root, fileName) //得到图片URL
        await fsp.writeFile(imagePath, body)
        await fsp.writeFile(`${imagePath}.json`, JSON.stringify(json, null,"\t"))
        //return imagePath
        console.log(image)
        console.log("save complete")
        console.log(imagePath)
        console.log(`${imagePath}.json`)
    }
    async getBase64FromArrayBuffer(arrayBuffer){
        const buffer = new Buffer(arrayBuffer.byteLength)
        const view = new Uint8Array(arrayBuffer)
        for(let i  = 0; i < buffer.length; i++){
            buffer[i] = view[i]
        }
        return "data:jpg;base64,"+buffer.toString("base64")
    }
    async downloadTodayBingImage(){
        try{
            const url = `${this.host}/HPImageArchive.aspx?format=js&idx=0&n=1&nc=1614319565639&pid=hp&FORM=BEHPTB&uhd=1&uhdwidth=3840&uhdheight=2160`
            const {body} = await request(url)
            const json = await body.json()
            await Promise.all(json.images.map((image)=>this.saveImage(image, json)))
        }catch(error){
            console.error(error)
        }
    }
}
new DownloadTodayBingImage()