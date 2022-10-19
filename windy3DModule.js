import * as THREE from 'three';
import WebGL from './threeJs/examples/jsm/capabilities/WebGL.js';
import { IFCLoader } from "./threeJs/examples/jsm/loaders/IFCLoader.js";

import { OrbitControls } from "../threeJs/examples/jsm/controls/OrbitControls.js";
import {Vector2} from "three";
let camera=null;
let renderer=null;
let scene = null;
let gl=null;
let buffer=null;
let program = null;
$(function(){
    var params;
    $.ajax({
        type: "get",
        url: "data/newData/grid20220827065700.json",
        dataType: "json",
        async:false,
        success: function (response) {
            params = {
                canvasWidth:window.innerWidth,
                canvasHeight:window.innerHeight,
                speedRate:0.05, //线的生成速率 （越慢越光滑）
                speed:0.585, //绘制速率
                particlesNumber:100,
                displayLayers:-1,
                maxAge:120,
                color: new THREE.Vector3(
                Math.random() * 0.6 + 0.4,//Math.random() * 0.6 + 0.4
                0.4 + 0.2,
                0.4 + 0.2),
                pointSize:8.0,
                lengthRate: 0.255
            };
            windy = new ThreeJs(response,params);
        },
        error: function (errorMsg) {
            console.log("请求数据失败!");
        }
    });

    var canrefresh = -1,canrefresh2 = -1;//拖动粒子个数和存活时间滑块时，不能随时刷新，需要隔一段时间刷新，避免卡顿
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_count',
            min:100,
            max:10000,
            value:params.particlesNumber,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    clearTimeout(canrefresh);
                    windy.particlesNumber = value;
                    canrefresh = setTimeout(function(){
                        windy.redraw();
                    },500);
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_layers',
            min:-1,
            max:20,
            value:params.displayLayers,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    clearTimeout(canrefresh);
                    windy.displayLayers = value;
                    canrefresh = setTimeout(function(){
                        windy.redraw();
                    },500);
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_length',
            min:1.0,
            max:100.0,
            value:params.lengthRate*100,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    windy.pointSize = value/100;
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_linewidth',
            min:1.0,
            max:20.0,
            value:params.pointSize,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    windy.pointSize = value;
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_speed',
            min:1,
            max:1000,
            value:params.speed,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    windy.speed = value/1000;
                }
            }
        });
    });
    layui.use('slider', function(){
        var slider = layui.slider;
        slider.render({
            elem: '#windy_age',
            min:10,
            max:500,
            value:params.maxAge,
            tips:false,
            input:true,
            theme:'#3b86ca',
            change: function(value){
                if(windy){
                    clearTimeout(canrefresh2);
                    windy.maxAge = value;
                    canrefresh2 = setTimeout(function(){
                        windy.redraw();
                    },500);
                }
            }
        });
    });
    // 颜色选择插件初始化
    $('.windycanvas_picker').each(function(inx,dom){
        $(dom).ColorPicker({
            color: $(dom).val(),
            pickerDom:$(dom),
            pickerDomInx:0,
            onShow: function (colpkr) {
                $(colpkr).fadeIn(300);
                return false;
            },
            onHide: function (colpkr) {
                $(colpkr).fadeOut(300);
                return false;
            },
            //onchange方法改过，pickerdom,inx是新增的属性
            //pickerdom：当前点击节点，inx就是pickerDomInx属性，跟for循环中i相同，用来更新颜色之后同步修改颜色数组
            onChange: function (hsb, hex, rgb,pickerdom,inx) {
                var colorvl = '#' + hex;
                $(pickerdom).val(colorvl);
                $(pickerdom).next().css({ "background-color":  colorvl});
                if(windy){
                    windy.color = colorvl;
                }
            }
        });
    });
})


class ThreeJs{
    constructor(json,params) {
        this.light=null;
        this.cube=null;
        this.canvasWidth = params.canvasWidth||window.innerWidth;//画板宽度
        this.canvasHeight = params.canvasHeight||window.innerHeight;//画板高度
        this.displayLayers= params.displayLayers||-1;   //展示层数，-1默认为总层数
        this.particlesNumber = params.particlesNumber ||3000;  //生成的粒子个数
        this.speedRate = params.speedRate ||0.10;
        this.speed = params.speed||0.105;
        this.maxAge=params.maxAge||120;
        this.color=params.color ;
        this.pointSize = params.pointSize||10.0;
        this.lengthRate=params.lengthRate||0.08;
        this.initOpacity=1; //粒子初始透明度
        this.windData = json;
        this.windField=null;
        this.particles=[];
        this.curves=[];
        this.animateFrame=null;
        this.frameTime = 10;//每秒刷新次数，因为requestAnimationFrame固定每秒60次的渲染，所以如果不想这么快，就把该数值调小一些
        this.pointInterval=0.015;
        this.uniforms = {
            u_time: {value: 0.0},
            // speed:{value:this.speed},
            // size:{value:this.pointSize},
            // startTime:{value:0.0},
            // maxAge:{value:this.maxAge},
            // color:{value:this.color}
            speedList:  { type: "v", value: [] },
        };

        this.matSetting = {
            color:this.color,
            size: this.pointSize,
            max_age:this.maxAge,
            points_number: 4000,
            speed :  this.speed,
            length_rate : this.lengthRate

        };
        this._init();
    }
    _init(){

        this.windField=this.createField();
        // 创建风场粒子
        for (var i = 0; i < this.particlesNumber; i++) {
            this.particles.push(this.randomParticle(new CanvasParticle()));
        }

        // let curves= this.initCircleCurveGroup();
        // console.log(curves)
        //group=new THREE.Group();
        if ( WebGL.isWebGL2Available() === false ) {

            document.body.appendChild( WebGL.getWebGL2ErrorMessage() );
            return;

        }
        this._initScene();
        this._initLight();
        this._initCamera();
        //Setup IFC Loader
        // this._initModel();
        // this._initObject();
        // var axisHelper = new THREE.AxesHelper(2500);
        // scene.add(axisHelper);
        this._initRenderer();
        // this._initShader();
        this.draw();
        // console.log(renderer)


    }
    _initModel(){
        var ifcLoader = new IFCLoader();
        ifcLoader.ifcManager.setWasmPath("../threeJs/examples/jsm/loaders/ifc/");
        ifcLoader.load(
            "../threeJs/examples/models/ifc/rac_advanced_sample_project.ifc",
            function (model) {
                model.translateX(-50);
                model.translateZ(19);
                model.mesh.renderOrder=2;
                scene.add(model.mesh);
            }
        );
    }
    _initRenderer(){
        renderer=new THREE.WebGLRenderer({  antialias: true } );//,logarithmicDepthBuffer: true
        if ( WebGL.isWebGL2Available() === false ) {

            document.body.appendChild( WebGL.getWebGL2ErrorMessage() );
            return;

        }
        renderer.setSize(this.canvasWidth, this.canvasHeight);//设置渲染区域尺寸

        // renderer.domElement.id = 'renderer_' + name;
        // renderer.setClearColor(0x000000, 1); //设置背景颜色
        document.body.appendChild(renderer.domElement);
        var that=this;
        const loopTime = 10 * 1000; // loopTime: 循环一圈的时间
        gl=renderer.getContext('webgl2');
        function render (){
            // console.log(camera.position)
            renderer.render(scene,camera);//执行渲染操作

            that.animateFrame=requestAnimationFrame(render);

            that.uniforms.u_time.value+=0.01;

        }
        render();
        var controls = new OrbitControls(camera,renderer.domElement);//创建控件对象
        window.addEventListener( 'resize', this.onWindowResize, false );

    }
    onWindowResize() {

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize( window.innerWidth, window.innerHeight );

    }
    //声明初始化着色器函数
    _initShader(){
        gl=renderer.getContext('webgl2');
        //顶点着色器源码
        var vertexShaderSource = document.getElementById('vertexShader').textContent;
        //片元着色器源码
        var fragmentShaderSource = document.getElementById('fragmentShader').textContent;
        //初始化着色器

        //创建顶点着色器对象
        var vertexShader = gl.createShader(gl.VERTEX_SHADER);
        //创建片元着色器对象
        var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        //引入顶点、片元着色器源代码
        gl.shaderSource(vertexShader,vertexShaderSource);
        gl.shaderSource(fragmentShader,fragmentShaderSource);
        //编译顶点、片元着色器
        gl.compileShader(vertexShader);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(vertexShader))
        }
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(fragmentShader))
        }
        //创建程序对象program
        var prg = gl.createProgram();
        //附着顶点着色器和片元着色器到program
        gl.attachShader(prg,vertexShader);
        gl.attachShader(prg,fragmentShader);
        //链接program
        gl.linkProgram(prg);
        if (!gl.getProgramParameter(prg, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(prg))
        }
        gl.detachShader(prg, vertexShader)
        gl.deleteShader(vertexShader)
        gl.detachShader(prg, fragmentShader)
        gl.deleteShader(fragmentShader)
        //使用program
        gl.useProgram(prg);
        //console.log(gl)
        program= prg;
    }
    initBuffers(){
        buffer=gl.createBuffer();
        if(!buffer){
            console.log("创建缓冲区对象失败");
            return -1;
        }
        gl.bindBuffer(gl.UNIFORM_BUFFER,buffer);

    }

    _initScene(){
        scene= new THREE.Scene()
        scene.background = new THREE.Color( 0x8cc7de );//0x8cc7de
    }
    _initLight() {
        const directionalLight1 = new THREE.DirectionalLight( 0xffeeff, 0.8 );
        directionalLight1.position.set( 1, 1, 1 );
        scene.add( directionalLight1 );

        const directionalLight2 = new THREE.DirectionalLight( 0xffffff, 0.8 );
        directionalLight2.position.set( - 1, 0.5, - 1 );
        scene.add( directionalLight2 );

        const ambientLight = new THREE.AmbientLight( 0xffffee, 0.25 );
        scene.add( ambientLight );
    }
    _initCamera() {
        camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 1000 );
        camera.position.z = 70;
        camera.position.y = 25;
        camera.position.x = 90;
    }
    //根据现有参数重新生成风场
    redraw(){
        window.cancelAnimationFrame(this.animateFrame);
        this.particles = [];
        this.curves=[];
        // renderer.properties.remove(material);
        this._init();
    }

    _parseWindJson() {
        var header = null,
            component=[];
        this.windData.forEach(function (record) {
            header=record.header;
            var data = record['data'];
            // var speed=[],
            //     angel=[];
            // for(var i=0;i<data.length;i++){
            //     var temp=data[i].split("/");
            //     speed.push(parseFloat(temp[0]));
            //     angel.push(parseFloat(temp[1]));
            // }
            // component.push({
            //     height: record.header.height,
            //     speed:speed,
            //     angel:angel
            // });
            var uComponent=[],
                vComponent=[];
            for(var i=0;i<data.length;i++){
                var temp=data[i].split("/");
                uComponent.push(parseFloat(temp[0]));
                vComponent.push(parseFloat(temp[1]));
            }
            component.push({
                height: record.header.height,
                uComponent:uComponent,
                vComponent:vComponent
                // speed:speed,
                // angel:angel
            });
        });
        // console.log(component)
        return {
            header: header,
            component:component
        };
    }
    createField(){
        var data=this._parseWindJson();
        return new GridSpace(data);
    }

    //随机数生成器（小数）
    fRandomByfloat(under, over){
        let res=under+Math.random()*(over-under)
        if(res<0) console.log(res)
        return res;
    }
    fRandomByInteger(under,over){
        return Math.floor(Math.random() * (over - under)) + under;
    }
    //根据当前风场网格行列数随机生成粒子
    randomParticle (particle) {
        var safe = 30,x, y,z;

        do {
            x = this.fRandomByfloat(0,this.windField.cols - 2);
            y = this.fRandomByfloat(0,(this.windField.rows - 2)/5);
            z = this.fRandomByInteger(0,this.displayLayers>0?Math.min(this.displayLayers-1,this.windField.layers - 1):this.windField.layers - 1);
        } while ((this.windField.getIn(x, y, z)[2] <= 0||this.windField.isInBound(x,y,z)) && safe++ < 30);
        // console.log(this.uniforms.u_time.value,particle.isCreated)
        var field = this.windField;
        var uvw = field.getIn(x, y, z);
        var nextX = x +  this.speedRate * uvw[0];// x +  this.speedRate * uvw[0]*Math.cos(uvw[1]);
        var nextY = y +  this.speedRate * uvw[1];// y +  this.speedRate * uvw[0]*Math.sin(uvw[1]);
        var nextZ = z;
        // var nextZ = z +  this.speedRate * uvw[2];
        particle.curvesPoints=[];
        particle.x = x;
        particle.y = y;
        particle.z = z;
        particle.tx = nextX;
        particle.ty = nextY;
        particle.tz=nextZ;
        particle.opacity=this.initOpacity;
        particle.speed = uvw[2];
        particle.age = this.maxAge//this.fRandomByInteger(2,this.maxAge);//每一次生成都不一样
        this.initCircleCurveGroup(particle)
        // if(particle.isCreated===false){
        //     this.initCircleCurveGroup(particle)
        //     particle.isCreated=true;
        //
        // }
        // else this.updateCircleCurveGroup(particle)
        return particle;
    }
    //根据粒子当前所处的位置(棋盘网格位置)，得到canvas画板中的位置，以便画图
    _map(x,y,z) {
        var field = this.windField,
            fieldWidth = field.cols,
            fieldHeight = field.rows,
            fieldLayers = field.layers,
            newArr = [0,0,0];

        newArr[0] = ((x/fieldWidth)*this.canvasWidth-(this.canvasWidth/2))/8;
        newArr[2] = ((y/fieldHeight)*this.canvasHeight-(this.canvasHeight/2))/8;
        newArr[1] = (z/fieldLayers)*100;

        return newArr;
    }
    _antiMap(n0,n1,n2){
        var field = this.windField,
            fieldWidth = field.cols,
            fieldHeight = field.rows,
            fieldLayers = field.layers,
            originArr = [0,0,0];
        originArr[0] = (n0*8+(this.canvasWidth/2))/this.canvasWidth*fieldWidth;
        originArr[1] = (n2*8+(this.canvasHeight/2))/this.canvasHeight*fieldHeight;
        originArr[2] = (n1/100)*fieldLayers;

        return originArr;
    }
    /**
     *初始化线条路径
     *
     *
     */
    initCircleCurveGroup(particle) {
        let self=this;
        var x = particle.x,
            y = particle.y,
            z = particle.z,
            tx =particle.tx,
            ty = particle.ty,
            tz = particle.tz,
            uvw = null;
        var time = particle.age;
        while(self.windField.isInBound(x, y, z)&&time>0){
            uvw = self.windField.getIn(x, y, z);
            var newPos = self._map(x,y,z);
            particle.curvesPoints.push(new THREE.Vector3(newPos[0],newPos[1],newPos[2]));
            time--;
            x=tx;
            y=ty;
            //z=tz;
            tx = tx + self.speedRate * uvw[0]; //tx + self.speedRate * uvw[0] * Math.cos(uvw[1]);
            ty = ty + self.speedRate * uvw[1]; //ty + self.speedRate * uvw[0] * Math.sin(uvw[1]);
        }
        var curve = new THREE.CatmullRomCurve3(particle.curvesPoints,false);
        curve.userData = this.uniforms.u_time.value;
        if (curve.points.length<=1){

            this.randomParticle(particle);
        }
        else{
            self.curves.push(curve)
            particle.curveIndex = this.curves.length-1;
        }
    }
    /**
     * 更新线条路径
     */
    updateCircleCurveGroup(particle){
        let self=this;
        var x = particle.x,
            y = particle.y,
            z = particle.z,
            tx =particle.tx,
            ty = particle.ty,
            tz = particle.tz,
            uvw = null;
        var time = particle.age;
        while(self.windField.isInBound(x,y,z)&&time>0){
            uvw = self.windField.getIn(x, y, z);
            var newPos = self._map(x,y,z);
            particle.curvesPoints.push(new THREE.Vector3(newPos[0],newPos[1],newPos[2]));
            time--;
            x=tx;
            y=ty;
            //z=tz;
            tx = tx + self.speedRate * uvw[0] * Math.cos(uvw[1]);
            ty = ty + self.speedRate * uvw[0] * Math.sin(uvw[1]);
        }
        var curve = this.curves[particle.curveIndex];
        // console.log(curve)
        curve.points=particle.curvesPoints;
        curve.userData = this.uniforms.u_time.value;
        //console.log(curve)
        // console.log(curve.userData)
        if (curve.points.length<=1){
            curve.points=[];
        }
        self.curves[particle.curveIndex]=curve;
    }
    /**
     * 初始化材质
     * */
    initLineMaterial(setting,pNumber,speedList) {
        let speed =setting ? Number(setting.speed) || 1.0 : 1.0;//this.uniforms.speed;//
        let length = Number(setting.length_rate*pNumber) ;
        let points_number = pNumber ;
        let size = setting ? Number(setting.size) || 2.0 : 2.0;//this.uniforms.size;//
        let max_age = setting?Number(setting.max_age) ||120 :120;//this.uniforms.maxAge;//
        // let color =  new THREE.Color( 0xffffff * Math.random() );
        let singleUniforms = {
            u_time:  this.uniforms.u_time,
            length : { type: "f", value: length },
            max_age: { type: "f", value: max_age },
            points_number: { type: "f", value: points_number },
            speed: {  type: "f", value: speed },
            speedList:{ value:speedList},
            uSize: { type: "f", value: size },
            // color: { value: color},
            colorList: {value:[new THREE.Color( 0xcc00ff ),
                    new THREE.Color( 0x002aff),
                    new THREE.Color(0x0054ff ),
                    new THREE.Color( 0x007eff),
                    new THREE.Color( 0x00a8ff),
                    new THREE.Color( 0x00d2ff),
                    new THREE.Color( 0x14d474),
                    new THREE.Color(0xa6dd00 ),
                    new THREE.Color( 0xffe600),
                    new THREE.Color( 0xffb300),
                    new THREE.Color( 0xff8000),
                    new THREE.Color(0xff4d00 ),
                    new THREE.Color( 0xff1a00),
                    new THREE.Color( 0xe60000),
                    new THREE.Color(0xb30000 )]}
        }
        ;

        return new THREE.ShaderMaterial({
            uniforms: singleUniforms,
            vertexShader: document.getElementById("vertexShader").textContent,
            fragmentShader: document.getElementById("fragmentShader").textContent,
            transparent: true,
            depthWrite: false,
            glslVersion: THREE.GLSL3
        });
    }
    draw(){
        let self=this;
        let i=1;
        let maxLength=0;
        for(let curve of this.curves) {

            var curveLength=self.getCurveLength(curve.points)

            var interval = (curveLength)/this.pointInterval ;

            var points = curve.getPoints(interval);
            var geometry = new THREE.BufferGeometry().setFromPoints(points);
            let length = points.length;
            var pNumber = length;
            var indexes = new Float32Array(length)
            var speed=new Float32Array(length);

            for (let i = 0; i < points.length; i += 1) {
                indexes[i] = i;
                var trans=self._antiMap(points[i].x,points[i].y,points[i].z);
                // console.log(trans,self.windField.rows,self.windField.cols);
                speed[i]=self.windField.getIn(Math.floor(trans[0]),Math.floor(trans[1]),Math.floor(trans[2]))[2];


            }
            if(points.length>maxLength) maxLength=points.length;
            geometry.setAttribute("aIndex", new THREE.Float32BufferAttribute(indexes, 1));
            //geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speed,1));

            geometry.verticesNeedUpdate = true;
            let lineMaterial = self.initLineMaterial(self.matSetting,pNumber,speed);

            let obj = new THREE.Points(geometry,lineMaterial);
            scene.add(obj);
            // curve.sceneIndex = obj.id;
        }
    }
    getCurveLength(points){

        var length=0;
        var x0,x1,y0,y1;
        for(var i=1;i<points.length;i++){
            let a=points[i-1];
            let b=points[i];
            x0=a.x;
            x1=b.x;
            y0=a.y;
            y1=b.y;

            length+=Math.sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0));
        }

        if(length===0) console.log(points)
        return length;
    }
}

class GridSpace{
    constructor(obj) {
        this.west = null;
        this.east = null;
        this.south = null;
        this.north = null;
        this.up=null;
        this.down=null;

        this.rows = null;
        this.cols = null;
        this.layers=null;
        this.dx = null;
        this.dy = null;
        this.dz=null;

        this.grid = null;
        this._init(obj);
    }
    _init(obj){
        var header=obj.header,
            component=obj['component'];
        this.west = header['la1'];
        this.east = header['la2'];
        this.south = header['lb1'];
        this.north = header['lb2'];
        this.up=header['lc2'];
        this.down=header['lc1'];

        this.rows = header['ny'];
        this.cols = header['nx'];
        this.layers=header['nz'];
        this.dx = header['dx'];
        this.dy = header['dy'];
        this.dz = header['dz'];

        this.grid=[];

        var n=0,
            layers = null,rows=null,uv=null,
            i,j,k;
        for(k=0;k<this.layers;k++){
            layers=[];
            for(j=0;j<this.rows;j++){
                rows=[];
                for(i=0;i<this.cols;i++){
                    // var uvw= [component[k].speed[j*this.cols+i],component[k].angel[j*this.cols+i]];
                    // rows.push(uvw);
                    uv=this._calcUV(component[k].uComponent[j*this.cols+i],component[k].vComponent[j*this.cols+i]);
                    rows.push(uv);
                }
                layers.push(rows);
            }
            this.grid.push(layers);

        }
        // console.log(this.grid);
    }
    _calcUVW(u,v,w){
        var val=Math.sqrt(u * u + v * v);
        return [u, v, w, Math.sqrt(val * val + w * w)];
    }
    _calcUV(u, v) {
        return [+u, +v, Math.sqrt(u * u + v * v)];
    }
    //双线性插值计算给定节点的速度
    _bilinearInterpolation (tx, ty, g00, g10, g01, g11) {
        var rx = (1 - tx);
        var ry = (1 - ty);
        var a = rx * ry, b = tx * ry, c = rx * ty, d = tx * ty;
        // var speed = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        // var angel = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        // return [speed,angel];
        var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return this._calcUV(u,v);
    }
    //三线性插值计算给定节点的速度
    _trilinearInterpolation(tx, ty, tz, g000,g100,g010,g110,g001,g101,g011,g111) {
        var rx = (1 - tx);  //x1-x
        var ry = (1 - ty);  //y1-y
        var rz=  1 - tz;    //z1-z
        var speed,angel,v,w;
        var a=rx*ry*rz, b=rz*ry*tx,c=rz*ty*rx,d=rz*ty*tx,
            e=tz*ry*rx,f=tz*ry*tx,g=tz*ty*rx,h=tz*ty*tx;
        speed=a*g000[0]+b*g100[0]+c*g010[0]+d*g110[0]+e*g001[0]+f*g101[0]+g*g011[0]+h*g111[0];
        angel= a*g000[1]+b*g100[1]+c*g010[1]+d*g110[1]+e*g001[1]+f*g101[1]+g*g011[1]+h*g111[1];
        return [speed,angel];
    }
    getIn(x, y, z) {
        // console.log(x,y)
        var x0 = Math.floor(x),//向下取整
            y0 = Math.floor(y),
            // z0=Math.floor(z),
            x1, y1,z1;
        if (x0 === x && y0 === y) {  //x0 === x && y0 === y&&z0===z
            try {
                return this.grid[z][y][x];
            }catch (e) {
                //console.log(x,y)
            }

        }

        x1 = x0 + 1;
        y1 = y0 + 1;
        // z1 = z0 + 1;
        var g00 = this.getIn(x0, y0,z),
            g10 = this.getIn(x1, y0,z),
            g01 = this.getIn(x0, y1,z),
            g11 = this.getIn(x1, y1,z);
        return this._bilinearInterpolation(x - x0, y - y0, g00, g10, g01, g11);
    }
    isInBound(x, y,z) { //坐标是否在棋盘内部
        return (x >= 0 && x < this.cols-2) && (y >= 0 && y < this.rows-2) && (z >= 0 && z < this.layers-1);
    }
}

/****
 *粒子对象
 ****/
class CanvasParticle{
    constructor() {
        this.x = null;//粒子初始x位置(相对于棋盘网格，比如x方向有360个格，x取值就是0-360，这个是初始化时随机生成的)
        this.y = null;//粒子初始y位置(同上)
        this.z = null;//粒子初始z位置(同上)
        this.tx = null;//粒子下一步将要移动的x位置，这个需要计算得来
        this.ty = null;//粒子下一步将要移动的y位置，这个需要计算得来P
        this.tz = null;//粒子下一步将要移动的z位置，这个需要计算得来
        this.age = null;//粒子生命周期计时器，每次-1
        this.opacity=null;
        this.speed = null;//粒子移动速度，可以根据速度渲染不同颜色
        this.curvesPoints=[];//粒子轨迹上的点集合
        this.curveIndex=null;  //粒子轨迹在curveGroup里面的索引
        // this.isCreated=false;
    }
}
// export {ThreeJs}
