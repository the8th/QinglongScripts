const {request} = require("undici")
const {JSDOM} = require("jsdom");
const CryptoJS = require("crypto-js");
const fsp = require("fs/promises")
const fs = require("fs")
const compressing = require("compressing")
const Path = require("path")
const baseUrl = "https://xxxx.xxxx/"
const basePath = "/home/upload/manga"
var KEY = ""
var IV = ""
function decrypt(str) {
    var key = CryptoJS.enc.Utf8.parse(KEY);
    var iv = CryptoJS.enc.Utf8.parse(IV);
    var decrypted = CryptoJS.AES.decrypt(str, key, {
        iv: iv,
        padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
}
async function zipDir(dir){
    return new Promise((resolve,reject)=>{
        const dirPath = Path.join(basePath, dir)
        return fsp.readdir(dirPath).then(files=>{
            const zipFilePath = Path.join(basePath, `${dir}.zip`)
            const stream = new compressing.zip.Stream()
            for(let file of files){
                const filePath = Path.join(dirPath, file)
                stream.addEntry(filePath)
            }
            const destStream = fs.createWriteStream(zipFilePath)
            destStream.on("error", reject)
            destStream.on("finish", resolve)
            stream.pipe(destStream)
        })
    })
}
async function getSourceCodePage(url, options = null){
    const {body} = await request(url, options)
    const html = await body.text()
    return html
    //return new JSDOM(html).window.document
}
async function getIndexUrl(){
    const html = await getSourceCodePage(baseUrl)
    const document = new JSDOM(html).window.document
    let index = ""
    document.querySelectorAll(".apo").forEach(item=>{
    //    console.log(item.innerHTML)
        if(item.innerHTML === "所有漫畫")index = item.href
    })
    if(!index)throw "没有找到首页"
    const url = `${baseUrl}${index}`
    return url
}
//获取漫画列表
async function getMangaList(pageUrl){
    const html = await getSourceCodePage(pageUrl,{
        headers : {
            "cookie": "limit=100"
        }
    })
    const document = new JSDOM(html).window.document
    
    const aei = html.match(/var aei = '(.*)'/i)[1]
    const aek = html.match(/var aek = '(.*)'/i)[1]
    KEY = aek
    IV = aei
    const list = document.querySelectorAll(".image-info")
    return [...list].map(item=>{
        const a = item.querySelector(".title a")
        if(a.href.startsWith("http"))return ""
        const id = a.href.split("=")[1]
    //    console.log(a.title)
    //    console.log(decrypt(a.title))
        return {
            title: decrypt(a.title),
            url:`${baseUrl}readOnline2.php?ID=${id}&host_id=0`
        }
    }).filter(item=>item)
}
function sleep(secs){
    return new Promise((resolve)=>{
        return setTimeout(resolve, secs * 1000)
    })
}
//获取漫画图片列表
async function getMangaImages(pageInfo){
    const html = await getSourceCodePage(pageInfo.url)
    const baseUrl = html.match(/var HTTP_IMAGE = "(.*)";/i)[1]
    const arrayStr = html.match(/    Original_Image_List = (.*);/i)[1]
    const array = new Function(`return ${arrayStr}`)()
    return array.map(item=>{
        return {
            url: `${baseUrl}${item.new_filename}_w900.${item.extension}`,
            extension: item.extension
        }
    })
}
async function downloadManga(manga){
    console.log("downloading ... ")
    //检查目录是否存在 如果存在表示已下载过
    const path = Path.join(basePath, manga.title)
    const zipFilePath = Path.join(basePath, `${manga.title}.zip`)
    try{
        const stat = await fsp.stat(zipFilePath)
        //if(!stat.isDirectory)throw new Error(`无法写入文件,以下文件已存在且不是目录：${path}`)
        console.log("already exist, skipping ")
    }catch(error){
        if(!error.toString().includes("ENOENT"))throw error
        console.log(`creating directory ...`)
        await fsp.mkdir(path)
        const images = await getMangaImages(manga)
        manga.images = images
        //写入描述文件
        const metaPath = Path.join(path, "meta.json")
        await fsp.writeFile(metaPath, JSON.stringify(manga, null,"\t"))
        //开始下载文件
        for(let i = 0 ; i<images.length; i++){
            const {url, extension} = images[i]
            const {body} = await request(url)
            console.log(i+1,"/", images.length)
            const imagePath = Path.join(path, `${i}.${extension}`) //得到图片URL
            await fsp.writeFile(imagePath, body)
        }
        //压缩目录为zip
        await zipDir(manga.title)
        //await compressing.zip.compressDir(path, zipFilePath)
        await fsp.rm(path, {
            recursive: true
        })
        console.log("download complete")
    }
}
// 如果目录不存在则创建
async function mkRootDir(){
    try{
        const stat = await fsp.stat(basePath)
        if(!stat.isDirectory)throw new Error(`无法写入文件,以下文件已存在且不是目录：${basePath}`)
    }catch(error){
        if(!error.toString().includes("ENOENT"))throw error
        console.log("creating root directory...")
        await fsp.mkdir(basePath)
    }
}
async function start(){
    try{
        console.log("start...")
        await mkRootDir()
        const files = await fsp.readdir(basePath)
        const indexUrl = await getIndexUrl()
        let mangaPages = await getMangaList(indexUrl)
        console.log("get list complete, count:", mangaPages.length)
        // 先去除已存在的任务
        mangaPages = mangaPages.filter(manga=>{
            const fileName = `${manga.title}.zip`
            if(files.includes(fileName)){
                console.log("> ", fileName)
                return false
            }
            return true
        })
        for(let [index, manga] of mangaPages.entries()){
            console.log(`[${index+1}/${mangaPages.length} ]`, `start doanload...`, manga.title)
            await downloadManga(manga)
            await sleep(1)
        }
        console.log("finish...")
    }catch(error){
        console.log("error...")
        console.error(error)
    }
}
start()