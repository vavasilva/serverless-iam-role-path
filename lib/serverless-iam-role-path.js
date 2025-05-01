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

    const defaultPath = service.custom?.iamRolePath?.path || service.custom?.['serverless-iam-role-path']?.path;

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

        // Log role name if it exists
        const roleName = resources[resourceName].Properties?.RoleName;
        if (roleName) {
          if (typeof roleName === 'string') {
            this.serverless.cli.log(`ServerlessIamRolePath: Role has name: ${roleName}`);
          } else if (roleName['Fn::Join']) {
            this.serverless.cli.log(`ServerlessIamRolePath: Role has dynamic name using Fn::Join`);
          }
        }
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

      // First, try to find roles with a RoleName property that matches iamRoleStatementsName
      if (functionObj.iamRoleStatementsName) {
        const customRoleName = functionObj.iamRoleStatementsName;
        this.serverless.cli.log(`ServerlessIamRolePath: Looking for role with name matching: ${customRoleName}`);

        let roleFound = false;

        // Check roles for matching RoleName property
        Object.keys(resources).forEach(resourceName => {
          const resource = resources[resourceName];
          if (resource.Type === 'AWS::IAM::Role') {
            const roleName = resource.Properties?.RoleName;

            // Check for exact string match
            if (typeof roleName === 'string' && roleName === customRoleName) {
              this.serverless.cli.log(`ServerlessIamRolePath: Found exact match with RoleName: ${customRoleName}`);
              resource.Properties.Path = functionPath;
              roleFound = true;
            }
            // Check for Fn::Join that might produce the name we want
            else if (roleName && roleName['Fn::Join']) {
              const joinParts = roleName['Fn::Join'][1];
              if (joinParts && joinParts.includes(customRoleName)) {
                this.serverless.cli.log(`ServerlessIamRolePath: Found potential match in Fn::Join for RoleName: ${customRoleName}`);
                resource.Properties.Path = functionPath;
                roleFound = true;
              }
            }
          }
        });

        if (roleFound) {
          return; // Skip further checks if we found the role by name
        }
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

      // Special check for role names that contain the function name
      if (!roleFound) {
        Object.keys(resources).forEach(resourceName => {
          if (!roleFound &&
              resources[resourceName].Type === 'AWS::IAM::Role' &&
              resourceName.includes(functionName.replace(/_/g, 'Underscore'))) {
            this.serverless.cli.log(`ServerlessIamRolePath: Setting Path to ${functionPath} for role ${resourceName} (contains function name: ${functionName})`);
            resources[resourceName].Properties = resources[resourceName].Properties || {};
            resources[resourceName].Properties.Path = functionPath;
            roleFound = true;
          }
        });
      }

      if (!roleFound) {
        this.serverless.cli.log(`ServerlessIamRolePath: Warning: Could not find IAM role resource for function ${functionName}. Tried: ${possibleRoleNames.join(', ')}`);
      }
    });

    // IMPORTANTE: REMOVER ISSO PARA EVITAR CONFLITOS DE PERMISSÃO
    // Não vamos mais aplicar o path ao role global IamRoleLambdaExecution
    // Isso resolve o problema de permissão durante o deploy
    this.serverless.cli.log(`ServerlessIamRolePath: Skipping default role IamRoleLambdaExecution to avoid permission issues`);

    // Apenas para debug, mostrar as roles modificadas
    this.serverless.cli.log('ServerlessIamRolePath: Final list of modified IAM roles:');
    Object.keys(resources).forEach(resourceName => {
      const resource = resources[resourceName];
      if (resource.Type === 'AWS::IAM::Role') {
        this.serverless.cli.log(`${resourceName}: Path=${resource.Properties?.Path || 'not set'}`);
      }
    });
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