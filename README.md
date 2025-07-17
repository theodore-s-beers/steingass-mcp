# MCP Server for Steingass' Persian-English Dictionary

This is a basic MCP ([Model Context Protocol](https://modelcontextprotocol.io/))
server that provides access to [my API](https://steingass.theobeers.com/) for
Steingass' Persian-English dictionary through Claude Desktop and other MCP
clients.

## Features

- Search across Persian headwords, full headwords, or definitions
- Look for exact matches, full words contained, or prefixes
- Results are shaped to be simple, clear, and usable by an LLM

## Installation

### Prerequisites

- Node.js in a recent version
- Claude Desktop or similar

### Setup

1. Clone this repository:

   ```sh
   git clone https://github.com/theodore-s-beers/steingass-mcp.git
   ```

2. Navigate to the project directory:

   ```sh
   cd steingass-mcp
   ```

3. Install the dependencies:

   ```sh
   npm install
   ```

4. Edit the config of your MCP client to add something like the following.
   Please note the use of absolute paths.

   ```json
   {
     "mcpServers": {
       "steingass-dictionary": {
         "command": "/abs/path/to/node",
         "args": ["/abs/path/to/steingass-mcp/main.js"]
       }
     }
   }
   ```

5. Make sure to restart your MCP client completely. You will also likely be
   prompted to grant permissions to this MCP server the first time that you use
   it, since it requires network access.

## Usage

This should be self-explanatory! Ask your LLM to search for something.
