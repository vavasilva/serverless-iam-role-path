'use strict';

class ServerlessIamRolePath {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'before:package:finalize': this.addPath.bind(this),
    };
  }

  addPath() {
    const service = this.serverless.service;

    // Check if serverless-iam-roles-per-function plugin is present
    const plugins = service.plugins || [];
    if (!plugins.includes('serverless-iam-roles-per-function')) {
      this.serverless.cli.log('Warning: serverless-iam-roles-per-function plugin is required for serverless-iam-role-path to work properly');
      return;
    }

    this.serverless.cli.log('ServerlessIamRolePath: Adding path to IAM roles...');

    const defaultPath = service.custom?.iamRolePath?.path;

    if (!defaultPath && !this.hasFunctionPaths(service)) {
      this.serverless.cli.log('ServerlessIamRolePath: No path configurations found, skipping.');
      return;
    }

    // Get all resources
    const cf = service.provider.compiledCloudFormationTemplate;
    if (!cf || !cf.Resources) {
      this.serverless.cli.log('ServerlessIamRolePath: No CloudFormation resources found.');
      return;
    }

    const resources = cf.Resources;

    // Log all IAM roles found for debugging
    this.serverless.cli.log('ServerlessIamRolePath: Scanning for IAM roles in CloudFormation template...');
    Object.keys(resources).forEach(resourceName => {
      if (resources[resourceName].Type === 'AWS::IAM::Role') {
        this.serverless.cli.log(`ServerlessIamRolePath: Found IAM role: ${resourceName}`);
      }
    });

    // Process all functions
    Object.keys(service.functions || {}).forEach(functionName => {
      const functionObj = service.functions[functionName];

      // Skip if using an existing role (via ARN)
      if (typeof functionObj.role === 'string' && functionObj.role.startsWith('arn:')) {
        this.serverless.cli.log(`ServerlessIamRolePath: Function ${functionName} uses existing role, skipping.`);
        return;
      }

      // Check if function has specific path configuration
      const functionPath = functionObj.iamRolePath || defaultPath;

      if (!functionPath) {
        this.serverless.cli.log(`ServerlessIamRolePath: No path defined for function ${functionName}, skipping.`);
        return;
      }

      // Find the role for this function by checking different naming patterns
      const possibleRoleNames = this.getPossibleRoleNames(functionName);

      let roleFound = false;
      
      // Try exact matches first
      for (const roleName of possibleRoleNames) {
        if (resources[roleName]) {
          const roleResource = resources[roleName];

          if (roleResource.Type === 'AWS::IAM::Role') {
            this.serverless.cli.log(`ServerlessIamRolePath: Setting Path to ${functionPath} for role ${roleName} (function: ${functionName})`);
            roleResource.Properties = roleResource.Properties || {};
            roleResource.Properties.Path = functionPath;
            roleFound = true;
            break;
          }
        }
      }
      
      // If no exact match, try case-insensitive match
      if (!roleFound) {
        const resourceNames = Object.keys(resources);
        for (const roleName of possibleRoleNames) {
          // Try to find a case-insensitive match
          const matchingResourceName = resourceNames.find(
            name => name.toLowerCase() === roleName.toLowerCase()
          );
          
          if (matchingResourceName && resources[matchingResourceName].Type === 'AWS::IAM::Role') {
            this.serverless.cli.log(`ServerlessIamRolePath: Setting Path to ${functionPath} for role ${matchingResourceName} (case-insensitive match for function: ${functionName})`);
            resources[matchingResourceName].Properties = resources[matchingResourceName].Properties || {};
            resources[matchingResourceName].Properties.Path = functionPath;
            roleFound = true;
            break;
          }
        }
      }
      
      // Check for custom role name from iamRoleStatementsName
      if (!roleFound && functionObj.iamRoleStatementsName) {
        const customRoleName = functionObj.iamRoleStatementsName;
        this.serverless.cli.log(`ServerlessIamRolePath: Checking for custom role name: ${customRoleName}`);
        
        // Look for exact match or for role that contains the custom name
        for (const resourceName of Object.keys(resources)) {
          const resource = resources[resourceName];
          if (resource.Type === 'AWS::IAM::Role' && 
              (resourceName === customRoleName || 
               (resource.Properties?.RoleName && resource.Properties.RoleName === customRoleName))) {
            this.serverless.cli.log(`ServerlessIamRolePath: Setting Path to ${functionPath} for custom role ${resourceName} (function: ${functionName})`);
            resource.Properties = resource.Properties || {};
            resource.Properties.Path = functionPath;
            roleFound = true;
            break;
          }
        }
      }

      if (!roleFound) {
        this.serverless.cli.log(`ServerlessIamRolePath: Warning: Could not find IAM role resource for function ${functionName}. Tried: ${possibleRoleNames.join(', ')}`);
      }
    });

    // Process default role if exists
    const defaultRoleName = 'IamRoleLambdaExecution';
    if (resources[defaultRoleName] && defaultPath) {
      const defaultRole = resources[defaultRoleName];

      if (defaultRole.Type === 'AWS::IAM::Role') {
        this.serverless.cli.log(`ServerlessIamRolePath: Setting Path to ${defaultPath} for default role ${defaultRoleName}`);
        defaultRole.Properties = defaultRole.Properties || {};
        defaultRole.Properties.Path = defaultPath;
      }
    }
  }

  getPossibleRoleNames(functionName) {
    const normalized = this.normalizeFunctionName(functionName);
    return [
      // Pattern used by serverless-iam-roles-per-function
      `${normalized}IamRoleLambdaExecution`,

      // Alternative patterns that might be used
      `${functionName}IamRoleLambdaExecution`,
      `${normalized}LambdaRole`,
      `${functionName}LambdaRole`,
      `${normalized}Role`,
      `${functionName}Role`
    ];
  }

  normalizeFunctionName(functionName) {
    return functionName.replace(/-/g, 'Dash')
        .replace(/_/g, 'Underscore')
        .replace(/\./g, 'Dot')
        .replace(/[^a-zA-Z0-9]/g, '');
  }

  hasFunctionPaths(service) {
    const functions = service.functions || {};
    return Object.values(functions).some(func => !!func.iamRolePath);
  }
}

module.exports = ServerlessIamRolePath;