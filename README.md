# Serverless IAM Role Path

A Serverless Framework plugin that adds support for IAM role paths to functions created with serverless-iam-roles-per-function.

## Installation

```bash
# NPM
npm install --save-dev serverless-iam-role-path

# Or using the Serverless Framework plugin command
serverless plugin install -n serverless-iam-role-path
```

## Requirements

- Serverless Framework v3.40.0 or later
- serverless-iam-roles-per-function v3.0.0 or later

## Usage

Add the plugin to your `serverless.yml` file. Make sure it's listed **after** the `serverless-iam-roles-per-function` plugin:

```yaml
plugins:
  - serverless-iam-roles-per-function
  - serverless-iam-role-path
```

### Default Path for All Functions

To add a default path for all IAM roles:

```yaml
custom:
  iamRolePath:
    path: '/my-service/'  # Note: Path must start and end with "/"
```

### Per-Function Path Configuration

You can also specify different paths for individual functions:

```yaml
functions:
  hello:
    handler: handler.hello
    iamRolePath: '/function/specific/path/'  # This will override the default path
    iamRoleStatements:
      - Effect: Allow
        Action:
          - s3:GetObject
        Resource: "arn:aws:s3:::my-bucket/*"
  
  world:
    handler: handler.world
    # This function will use the default path from custom.iamRolePath.path
    iamRoleStatements:
      - Effect: Allow
        Action:
          - dynamodb:GetItem
        Resource: '*'
```

## How it works

This plugin complements the `serverless-iam-roles-per-function` plugin by adding the Path property to all IAM roles created by it. The `serverless-iam-roles-per-function` plugin already supports permissions boundaries through the `iamPermissionsBoundary` property on functions, but it doesn't support setting a Path.

The plugin will:

1. Check if `serverless-iam-roles-per-function` is included in your plugins
2. Look for IAM roles that match the function names in your service
3. Add the specified path to each role (either the default path or function-specific path)

## Configuration Options

| Option | Description |
|--------|-------------|
| `custom.iamRolePath` | Default path as a simple string (e.g., `"/my-path/"`) for all IAM roles |
| `custom.iamRolePath.path` | Default path to assign to all IAM roles (must start and end with a forward slash) |
| `custom.iamRolePath.skipDefaultRole` | Set to `true` to skip applying the path to the default `IamRoleLambdaExecution` role |
| `functions.[name].iamRolePath` | Function-specific path as a simple string to override the default path |
| `functions.[name].iamRolePath.path` | Function-specific path defined as an object to override the default path |

### Alternative Configuration Formats

You can use a simplified format for both global and function-specific paths:

```yaml
custom:
  iamRolePath: '/my-path/'  # Simple string format

functions:
  hello:
    handler: handler.hello
    iamRolePath: '/function-specific-path/'  # Simple string format
```

### Skip Default Role

If you're experiencing permission issues during deployment, you can skip applying the path to the default role:

```yaml
custom:
  iamRolePath:
    path: '/my-path/'
    skipDefaultRole: true
```

## Notes

- IAM paths must start and end with a forward slash (/)
- Path character limit is 512 characters

## License

MIT