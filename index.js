const phantom = require('phantom');

const Koa = require('koa');
const router = require('koa-router')();
const cors = require('kcors');

const qiniu = require('qiniu');

const _config = require('./config.js');

qiniu.conf.ACCESS_KEY = _config.qiniu.ak;
qiniu.conf.SECRET_KEY = _config.qiniu.sk;

let phantomInstance = null;

async function genInstance() {
    if (phantomInstance) return phantomInstance;
    return await phantom.create();
}

async function render(options) {
    if (!options.url && !options.html) return null;
    const time = Date.now();
    const fileName = 'img-' + time + '.' + (options.format || 'jpeg');
    try {
        const instance = await genInstance();
        const page = await instance.createPage();
        if (options.url) {
            await page.open(options.url);
        } else {
            page.property('content', options.html);
        }
        page.property('viewportSize', {
            width: options.width || '',
            height: options.height || ''
        });
        await page.render('./screenshot/' + fileName, { format: options.format || 'jpeg', quality: (options.format === 'png' || options.format === 'jpeg') ? (options.quality || '60') : '' });
    } catch (e) {
        console.error(e);
    }
    return fileName;
};

function genUptoken(bucket, key) {
    var putPolicy = new qiniu.rs.PutPolicy(bucket + ":" + key);
    return putPolicy.token();
}

async function upload(filePath) {
    return new Promise((resolve, reject) => {
        const key = filePath.replace('./screenshot/', '');
        const extra = new qiniu.io.PutExtra();
        const uptoken = genUptoken(_config.qiniu.bucket, key);
        qiniu.io.putFile(uptoken, key, filePath, extra, function(err, ret) {
            if (!err) {
                // 上传成功， 处理返回值
                console.log(_config.qiniu.domain + key);
                resolve(_config.qiniu.domain + key);
            } else {
                // 上传失败， 处理返回代码
                console.log(err);
                reject(err);
            }
        });
    });
}

const App = new Koa();

router
    .get('/render', async(ctx) => {
        if (!ctx.query.url && !ctx.query.html) return ctx.body = {
            success: false,
            msg: 'url or html is required'
        };
        const fileName = await render(ctx.query);
        const url = await upload('./screenshot/' + fileName);
        ctx.body = {
            success: true,
            msg: 'success',
            url: url
        };
    })
    .all('*', (ctx) => {
        ctx.body = 'Hello World!'
    });

App
    .use(router.routes())
    .use(router.allowedMethods())
    .use(cors());

App.listen(_config.port);
console.log('Server listen on port: ' + _config.port);
