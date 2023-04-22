import {config} from "dotenv";
import {ChatGPTAPI} from 'chatgpt';
import fetch from 'node-fetch';
import colors from 'colors';
global.fetch=fetch;

console.clear();

config();

const api = new ChatGPTAPI({
    apiKey: process.env.OPENAI_API_KEY, // You can only see a 5x5 area around you where
    fetch,
    systemMessage: 
    `You are an intellignet path finding AI controlling an agent in a 2d grid world. You can see the whole grid where you are represented by character '@'.
    '#' represents obstacles, '.' represents air where you can walk, 'F' represents food (where you can also walk to collect it).

    IMPORTANT: Your goal is to find the food and walk on it to collect it.
    You should minimize the number of moves by avoid going back to where you have already been!

    You can only respond with one word: 'up', 'down', 'left', 'right' to move where you want, followed by the number of moves required to the closest food if you can see it.
    
    ---

    Example 1:
    
    .....
    ..#F.
    ..@#.
    .....
    ....#
    
    The number of moves to the closest food here is 6 because you need to walk around the obstacle: down, right, right, up, up, left
    
    ---
    
    Example 2:

    ..F.#
    ....#
    ..@##
    ##.##
    ....#
    
    The number of moves to the closest food here is 2: up, up`,
});

const Direction = {
    UP: {x: 0, y: 1, name: 'up'},
    DOWN: {x: 0, y: -1, name: 'down'},
    LEFT: {x: -1, y: 0, name: 'left'},
    RIGHT: {x: 1, y: 0, name: 'right'}
}

class Player {
    constructor(position, world) {
        this.position = position;
        this.world = world;
        
        this.dead = false;
        this.maxHunger = 10;
        this.hunger = this.maxHunger;
    }

    eat() {
        if (this.world.tiles[this.position.x][this.position.y] == 'F') {
            this.world.tiles[this.position.x][this.position.y] = '.';

            this.hunger = this.maxHunger;
            return true;
        }
        return false;
    }

    move(direction) {
        this.hunger--;

        let newX = this.position.x + direction.x;
        let newY = this.position.y + direction.y;

        let status = null;

        if (this.world.isWalkable(newX, newY)) {
            this.position.x = newX;
            this.position.y = newY;

            let eat = this.eat();
            status =  { move: true, eat: eat };
        } else {
            status = { move: false, eat: false };
        }
        
        if (this.hunger <= 0) this.dead = true;

        return status;
    }

    vision() {
        let range = 2;
        return this.world.stringify(this.position.x-range, this.position.y-range,
                                    this.position.x+range, this.position.y+range);
    }
}

class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        this.tiles = null;
        this.player = null;
        this.generate();
    }

    addPlayer(player) {
        this.player = player;
    }

    generate() {
        this.tiles = [];
        for (let x = 0; x < this.width; x++) {
            this.tiles.push([]);
            for (let y = 0; y < this.height; y++) {

                // if (x == 0 || x == this.width-1 || y == 0 || y == this.height-1) {
                //     this.tiles[x][y] = '#';
                // } else {
                //     if (Math.random() < 0.15) this.tiles[x][y] = '#';
                //     else this.tiles[x][y] = '.';
                // }
                // if (x == this.player.x && y == this.player.y) {
                //     this.tiles[x][y] = '.';
                //     continue;
                // }

                if (Math.random() < 0.15) this.tiles[x][y] = '#';
                else if (Math.random() < 0.05) this.tiles[x][y] = 'F';
                else this.tiles[x][y] = '.';
            }
        }
    }

    

    stringify(minX=0, minY=0, maxX=this.width-1, maxY=this.height-1) {
        let res = "";
        for (let y = maxY; y >= minY; y--) {
            for (let x = minX; x <= maxX; x++) {
                if (this.isOutside(x, y)) res += '#';
                else {
                    if (this.player && this.player.position.x == x && this.player.position.y == y) {
                        res += '@'
                    } else {
                        res += this.tiles[x][y];
                    }
                }
            }
            if (y > minY) res += '\n';
        }
        return res;
    }

    isOutside(x, y) {
        return x < 0 || x >= this.width || y < 0 || y >= this.height;
    }

    isWalkable(x, y) {
        if (this.isOutside(x, y)) return false;
        return this.tiles[x][y] != '#';
    }

    
}

function parseMove(text) {
    text = text.toLowerCase();
    let moves = {
        up: Direction.UP,
        down: Direction.DOWN,
        left: Direction.LEFT,
        right: Direction.RIGHT
    }

    let closestIndex = Number.MAX_VALUE;
    let closestDirection = null;

    for (let [name, move] of Object.entries(moves)) {
        let index = text.indexOf(name);
        if (index != -1 && index < closestIndex) {
            closestIndex = index;
            closestDirection = move;
        }
    }

    return closestDirection;
}

async function step(player, feedback) {
    let prompt = '';

    if (feedback && feedback.message) {
        prompt += `${feedback.message}\n\n---\n\n`;
    }

    

    // prompt += `hunger: ${player.hunger} / ${player.maxHunger}\n\n`;

    if (!feedback || feedback.success) {
        prompt += `CURRENT STATE:\n`;

        let vision = player.world.stringify();//player.vision();
        prompt += `vision:\n${vision}\n`

        prompt += '\n---\n\n';
    }

    prompt += `Enter a command where you want to move:`;

    console.log(`PROMPT:\n${prompt}`.red);
    
    let move = null;

    let response = null;
    if (!DONT_EMPTY_MY_WALLET) {
        response = await api.sendMessage(prompt, feedback ? {parentMessageId: feedback.prevId} : {});

        console.log(`\nRESPONSE:\n${response.text}`);

        move = parseMove(response.text);
    } else {
        var moves = Object.keys(Direction);
        move = Direction[moves[ moves.length * Math.random() << 0]];
    }

    
    let status = player.move(move);

    let message = '';

    if (status.move) {
        if (status.eat) message = `You have moved ${move.name} successfully, and ate food!`;
        else message = `You have moved ${move.name} successfully!`;
    } else {
        message = `You cannot move ${move.name}. There is a wall!`;
    } 

    return {
        message: message,
        success: status.move,
        prevId: (response != null) ? response.id : undefined
    }

    
}

async function main() {
    const WIDTH = 10;
    const HEIGHT = 10;

    let world = new World(WIDTH, HEIGHT);
    let player = new Player({x: 5, y: 5}, world);
    world.addPlayer(player);
    
    let feedback = null;

    // let response = (await api.sendMessage(`Come up with a plan`)).text;
    // console.log(`\nRESPONSE:\n${response}`);

    console.log(world.stringify());
    for (let i = 0; i < 10; i++) {
        console.log(`--- Step ${i+1} ---`)
        feedback = await step(player, feedback);
        console.log(world.stringify());
    }
    
}

const DONT_EMPTY_MY_WALLET = false;
main()