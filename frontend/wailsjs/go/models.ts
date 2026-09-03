export namespace config {
	
	export class Preset {
	    name: string;
	    transport: string;
	    command: string;
	    args: string;
	    env: string;
	    cwd: string;
	    url: string;
	    headers: string;
	
	    static createFrom(source: any = {}) {
	        return new Preset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.transport = source["transport"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.env = source["env"];
	        this.cwd = source["cwd"];
	        this.url = source["url"];
	        this.headers = source["headers"];
	    }
	}
	export class AppConfig {
	    theme: string;
	    locale: string;
	    presets: Preset[];
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.locale = source["locale"];
	        this.presets = this.convertValues(source["presets"], Preset);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace mcp {
	
	export class ServerCapabilities {
	    tools: boolean;
	    resources: boolean;
	    prompts: boolean;
	    logging: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ServerCapabilities(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tools = source["tools"];
	        this.resources = source["resources"];
	        this.prompts = source["prompts"];
	        this.logging = source["logging"];
	    }
	}
	export class ServerInfo {
	    name: string;
	    version: string;
	    protocolVersion: string;
	    instructions?: string;
	    capabilities?: ServerCapabilities;
	
	    static createFrom(source: any = {}) {
	        return new ServerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.protocolVersion = source["protocolVersion"];
	        this.instructions = source["instructions"];
	        this.capabilities = this.convertValues(source["capabilities"], ServerCapabilities);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectionStatus {
	    connected: boolean;
	    transport?: string;
	    server?: ServerInfo;
	    url?: string;
	    command?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connected = source["connected"];
	        this.transport = source["transport"];
	        this.server = this.convertValues(source["server"], ServerInfo);
	        this.url = source["url"];
	        this.command = source["command"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HTTPConfig {
	    url: string;
	    headers: Record<string, string>;
	    timeoutSec: number;
	
	    static createFrom(source: any = {}) {
	        return new HTTPConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.headers = source["headers"];
	        this.timeoutSec = source["timeoutSec"];
	    }
	}
	export class HistoryEntry {
	    id: string;
	    time: string;
	    method: string;
	    request?: any;
	    response?: any;
	    error?: string;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new HistoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.time = source["time"];
	        this.method = source["method"];
	        this.request = source["request"];
	        this.response = source["response"];
	        this.error = source["error"];
	        this.durationMs = source["durationMs"];
	    }
	}
	
	
	export class StdioConfig {
	    command: string;
	    args: string[];
	    env: string[];
	    cwd: string;
	
	    static createFrom(source: any = {}) {
	        return new StdioConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.command = source["command"];
	        this.args = source["args"];
	        this.env = source["env"];
	        this.cwd = source["cwd"];
	    }
	}

}

